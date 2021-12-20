import { S3Client, CreateMultipartUploadCommandInput } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import os from "os";
import { create as tarCreate } from "tar";
import { spawnSync } from "child_process";
import { uploadMultiPartFromStream } from "./lib/upload_multipart_from_stream";
import { Cleanup } from "./lib/cleanup";
import { log, logLevel, parseGoMigratorLog } from "./lib/logger";
import { createInterface } from "readline";
import { PassThrough } from "stream";

function GetMissingEnvVars(envs: string[]): string[] {
  const missing = [];
  for (const env of envs) {
    if (!Object.keys(process.env).includes(env)) {
      missing.push(env);
    }
  }
  return missing;
}

function GetRandomHex(size: number): string {
  return [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
}

function FormateDateToPath(date?: Date): string {
  if (typeof date === "undefined") date = new Date();
  // const dateTime = SetTimeToZero(dateTime);
  const dateStr = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
  const timeStr = `${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
  const fullDateTimeStr = `${dateStr}-${timeStr}`;
  return fullDateTimeStr;
}

function ErrorIfNotExist(path: string, message: string): boolean {
  const exists = fs.existsSync(path);

  if (!exists) {
    throw new Error(message);
  }
  return exists;
}

function TrimUnixSocket(string: string): string {
  if (string.startsWith("unix://")) {
    string = string.replace("unix://", "");
  }
  if (string.endsWith(":12379")) {
    string = string.replace(":12379", "");
  }
  return string;
}

function GetMigratorPath(): string {
  const envMigratorPath = process.env.MIGRATOR_PATH;
  let MIGRATOR_PATH = "/bin/migrator";

  if (typeof envMigratorPath !== "undefined") {
    MIGRATOR_PATH = envMigratorPath;
  }
  return MIGRATOR_PATH;
}

function GetS3Key(): string {
  const envKey = process.env.KEY;

  const datePath = FormateDateToPath();
  const defaultFileName = `dqlite-backup-${datePath}.tar.gz`;
  let KEY = defaultFileName;

  if (typeof envKey !== "undefined") {
    KEY = TrimObjectKey(envKey);
    if (KEY.endsWith("/")) {
      KEY = `${KEY}${defaultFileName}`;
    }
    if (!KEY.endsWith(".tar.gz")) {
      const oldExtension = path.parse(KEY).ext;
      KEY = KEY.replace(oldExtension, ".tar.gz");
    }
  }

  return KEY;
}

function TrimObjectKey(string: string): string {
  if (string.startsWith("/")) {
    string = string.substring(1, string.length);
  }
  return string;
}

function GetFileName(fullpath: string, extension?: string): string {
  const filename = path.basename(fullpath, extension);
  return filename;
}

function GetBackupDirectoryPath(filename: string): string {
  const osTmpPath = os.tmpdir();
  const hex = GetRandomHex(5);
  const tmpdir = `${osTmpPath}${path.sep}${filename}-${hex}`;
  return tmpdir;
}

function GetTempArchiveFilePath(filename: string): string {
  const osTmpPath = os.tmpdir();
  const tmpArchiveFile = `${osTmpPath}${path.sep}${filename}`;
  return tmpArchiveFile;
}

async function CreateTarGzFromFolder(destination: string, directory: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      // resolve path from working dir to target dir to avoid the full path of each file contianed in the archive
      // Example: /tmp/folder/file -> folder/file
      const workingDir = path.resolve(directory, "..");
      const targetDir = path.relative(workingDir, directory);
      tarCreate(
        {
          gzip: true,
          cwd: workingDir,
          file: destination,
        },
        [targetDir]
      ).then((value) => resolve(value));
    } catch (err) {
      reject(err);
    }
  });
}

async function UploadFile(client: S3Client, config: CreateMultipartUploadCommandInput, path: string) {
  const source = fs.createReadStream(path);
  await uploadMultiPartFromStream(client, source, config);
}

async function main() {
  process.on("SIGINT", async () => {
    log({ level: logLevel.Info, msg: "Caught interrupt signal ..." });
    await Cleanup(dataToClean);
    process.exit(1);
  });
  log({ level: logLevel.Info, msg: "Loading config from environment variables ..." });

  const requiredEnvVars = ["AWS_REGION", "KINE_ENDPOINT", "BUCKET", "KEY"];

  const missing = GetMissingEnvVars(requiredEnvVars);

  if (missing.length >= 1) {
    throw new Error(`Configuration is invalid. Missing ${missing.length} environment variables. Please set the following:\n\t${missing}`);
  }

  const KINE_ENDPOINT = TrimUnixSocket(process.env.KINE_ENDPOINT!);

  const AWS_REGION = process.env.AWS_REGION;
  const BUCKET = process.env.BUCKET;
  const KEY = GetS3Key();
  log({ level: logLevel.Info, msg: `Backup wil be stored at ${BUCKET}/${KEY} in ${AWS_REGION}` });

  const MIGRATOR_PATH = GetMigratorPath();
  const DEBUG = process.env.DEBUG == "true" ? true : false;

  log({ level: logLevel.Info, msg: "Checking presents of kine endpoint and migrator binary ..." });
  if (ErrorIfNotExist(KINE_ENDPOINT, `Kine endpoint ${KINE_ENDPOINT} can not be found.`)) {
    log({ level: logLevel.Debug, msg: `Kine endpoint found at ${KINE_ENDPOINT} => unix://${KINE_ENDPOINT}` });
  }
  if (ErrorIfNotExist(MIGRATOR_PATH, `Migrator could not be found at ${MIGRATOR_PATH}.`)) {
    log({ level: logLevel.Info, msg: `Migrator binary found at ${MIGRATOR_PATH}` });
  }

  const tmpArchive = GetTempArchiveFilePath(GetFileName(KEY));
  log({ level: logLevel.Debug, msg: `Backup tarball file path ${tmpArchive}` });

  const tmpdir = GetBackupDirectoryPath(GetFileName(KEY, ".tar.gz"));
  log({ level: logLevel.Debug, msg: `Backup dir will be at ${tmpdir}` });

  const dataToClean = [tmpdir, tmpArchive];

  const args = ["--endpoint", `unix://${KINE_ENDPOINT}`, "--mode", "backup-dqlite", "--db-dir", tmpdir];

  if (DEBUG) {
    args.push("--debug");
    log({ level: logLevel.Debug, msg: `Backup command: ${MIGRATOR_PATH} ${args}` });
  }

  try {
    log({ level: logLevel.Debug, msg: "Starting backup" });

    // Start CMD and read output line by line from buffer.
    // See: https://stackoverflow.com/questions/36896841/read-strings-line-by-line-from-buffer-instance-in-node-js-module
    const cmd = spawnSync(MIGRATOR_PATH, args);
    const bufferStream = new PassThrough();
    bufferStream.end(cmd.stderr); // For some reason go-migrator decided to write to stdout instead of stderr.
    parseGoMigratorLog(createInterface({ input: bufferStream }));
  } catch (err) {
    log({ level: logLevel.Fatal, msg: `Backup failed with error: ${err}` });
    await Cleanup(dataToClean);
  }

  const client = new S3Client({
    region: AWS_REGION,
  });

  const config: CreateMultipartUploadCommandInput = {
    Bucket: BUCKET,
    Key: KEY,
  };

  await CreateTarGzFromFolder(tmpArchive, tmpdir);
  await UploadFile(client, config, tmpArchive);
  await Cleanup(dataToClean);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    log({ level: logLevel.Fatal, msg: `Main failed with error: ${err}` });
    process.exit(1);
  });
