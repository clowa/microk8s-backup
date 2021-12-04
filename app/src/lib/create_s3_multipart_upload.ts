import { CreateMultipartUploadCommand, CreateMultipartUploadCommandInput, CreateMultipartUploadCommandOutput, S3Client } from "@aws-sdk/client-s3";
import { log, logLevel } from "./logger";

export async function createS3MultipartUpload(
  client: S3Client,
  config: CreateMultipartUploadCommandInput
): Promise<CreateMultipartUploadCommandOutput> {
  const response = await client.send(new CreateMultipartUploadCommand(config));

  log(
    {
      level: logLevel.Info,
      msg: "Upload initiated",
    },
    {
      UploadId: response.UploadId,
      Key: response.Key,
      ServerSideEncryption: response.ServerSideEncryption,
    }
  );
  return response;
}
