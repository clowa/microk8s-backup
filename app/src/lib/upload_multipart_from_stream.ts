import {
  CompletedPart,
  S3Client,
  CreateMultipartUploadCommandInput,
  UploadPartCommandInput,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { ReadStream } from "fs";
import { createS3MultipartUpload } from "./create_s3_multipart_upload";
import { log, logLevel } from "./logger";
import { uploadPart } from "./upload_part";

export async function uploadMultiPartFromStream(client: S3Client, file: ReadStream, config: CreateMultipartUploadCommandInput): Promise<void> {
  const createUploadResponse = await createS3MultipartUpload(client, config);
  const { Bucket, Key, UploadId } = createUploadResponse;

  // 5MB is the minimum part size
  // Last part can be any size (no min.)
  // Single part is treated as last part (no min.)
  const chunkSize = 10 * 1024 * 1024; // 10MB

  // read the file to upload using streams and upload part by part to S3
  const uploadPartsPromise: Promise<CompletedPart[]> = new Promise((resolve, reject) => {
    let partNumber = 1;
    let chunkAccumulator: Buffer | null = null; // Store data to buffer until min chunk size is reached.
    const uploadedParts: CompletedPart[] = [];

    file.on("error", (err) => {
      reject(err);
    });

    file.on("end", () => {
      log({ level: logLevel.Debug, msg: "End of read stream." });
    });

    file.on("data", async (chunk: Buffer) => {
      // it reads in chunks of 64KB. We accumulate them up to 10MB and then we send to S3
      if (chunkAccumulator === null) {
        chunkAccumulator = chunk;
      } else {
        chunkAccumulator = Buffer.concat([chunkAccumulator, chunk]);
      }
      if (chunkAccumulator.length > chunkSize) {
        // pause the stream to upload this chunk to S3
        file.pause();

        try {
          const uploadParams: UploadPartCommandInput = {
            Bucket: Bucket,
            Key: Key,
            PartNumber: partNumber,
            UploadId: UploadId,
            Body: chunkAccumulator!,
            ContentLength: chunkAccumulator!.length,
          };

          await uploadPart(client, uploadParams, uploadedParts, partNumber);
          // Prepare for next part and increment partNumber.
          partNumber++;
          // Clear chunkAccumulator for next part collection.
          chunkAccumulator = null;
          // Resume stream.
          file.resume();
        } catch (err) {
          log(
            {
              level: logLevel.Fatal,
              msg: `An error occurred while uploading a part with error: ${err}`,
            },
            {
              partNumber: partNumber,
            }
          );
          reject(err);
        }
      }
    });

    file.on("close", async () => {
      log({ level: logLevel.Debug, msg: "Closing read stream." });
      if (chunkAccumulator) {
        try {
          // Upload the last chunk
          const uploadParams: UploadPartCommandInput = {
            Bucket: Bucket,
            Key: Key,
            PartNumber: partNumber,
            UploadId: UploadId,
            Body: chunkAccumulator!,
            ContentLength: chunkAccumulator!.length,
          };

          await uploadPart(client, uploadParams, uploadedParts, partNumber);
          chunkAccumulator = null;
          resolve(uploadedParts);
        } catch (err) {
          log(
            {
              level: logLevel.Fatal,
              msg: `An error occurred while uploading a part with error: ${err}`,
            },
            {
              partNumber: partNumber,
            }
          );
          reject(err);
        }
      }
    });
  });

  const uploadedParts = await uploadPartsPromise;

  log(
    {
      level: logLevel.Info,
      msg: "All parts have been upload. Completing multipart upload.",
    },
    {
      partCount: uploadedParts.length,
    }
  );

  const completeData = await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: Bucket,
      Key: Key,
      UploadId: UploadId,
      MultipartUpload: {
        Parts: uploadedParts,
      },
    })
  );
  log(
    {
      level: logLevel.Info,
      msg: "Multipart upload completed successfully.",
    },
    {
      Key: completeData.Key,
      UploadId: UploadId,
    }
  );
}
