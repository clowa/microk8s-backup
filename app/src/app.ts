import { S3Client, CreateMultipartUploadCommandInput } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import os from "os";
import tar from "tar";
import { execSync } from "child_process";
import { uploadMultiPartFromStream } from "./lib/upload_multipart_from_stream";
import { Cleanup } from "./lib/cleanup";

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
      tar
        .create(
          {
            gzip: true,
            cwd: workingDir,
            file: destination,
          },
          [targetDir]
        )
        .then((value) => resolve(value));
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
    console.log("Caught interrupt signal ...");
    await Cleanup(dataToClean);
    process.exit(1);
  });

  console.log("Loading config from environment variables ...");

  const requiredEnvVars = ["AWS_REGION", "KINE_ENDPOINT", "BUCKET", "KEY"];

  const missing = GetMissingEnvVars(requiredEnvVars);

  if (missing.length >= 1) {
    throw new Error(`Configuration is invalid. Missing ${missing.length} environment variables. Please set the following:\n\t${missing}`);
  }

  const KINE_ENDPOINT = TrimUnixSocket(process.env.KINE_ENDPOINT!);

  const AWS_REGION = process.env.AWS_REGION;
  const BUCKET = process.env.BUCKET;
  const KEY = GetS3Key();
  console.log(`Backup wil be stored at ${BUCKET}/${KEY} in ${AWS_REGION}`);

  const MIGRATOR_PATH = GetMigratorPath();
  const DEBUG = process.env.DEBUG == "true" ? true : false;

  console.log("Checking presents of kine endpoint and migrator binary ...");
  if (ErrorIfNotExist(KINE_ENDPOINT, `Kine endpoint ${KINE_ENDPOINT} can not be found.`)) {
    console.log(`   Kine endpoint found at ${KINE_ENDPOINT} => unix://${KINE_ENDPOINT}`);
  }
  if (ErrorIfNotExist(MIGRATOR_PATH, `Migrator could not be found at ${MIGRATOR_PATH}.`)) {
    console.log(`   Migrator binary found at ${MIGRATOR_PATH}`);
  }

  const tmpArchive = GetTempArchiveFilePath(GetFileName(KEY));
  console.log(`Backup tarball file path ${tmpArchive}`);

  const tmpdir = GetBackupDirectoryPath(GetFileName(KEY, ".tar.gz"));
  console.log(`Backup dir will be at ${tmpdir}`);

  const dataToClean = [tmpdir, tmpArchive];

  let cmd = `${MIGRATOR_PATH} --endpoint unix://${KINE_ENDPOINT} --mode backup-dqlite --db-dir ${tmpdir}`;

  if (DEBUG) {
    cmd = `${cmd} --debug`;
    console.log(`Backup command: ${cmd}`);
  }

  try {
    console.log("Starting backup ...");
    execSync(cmd, { stdio: "inherit" });
  } catch (err) {
    console.log("Backup failed ...");
    console.log(`Error:\n ${err}`);
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
    console.log(err);
    process.exit(1);
  });
