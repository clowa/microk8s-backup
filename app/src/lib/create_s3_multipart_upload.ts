import { CreateMultipartUploadCommand, CreateMultipartUploadCommandInput, CreateMultipartUploadCommandOutput, S3Client } from "@aws-sdk/client-s3";

export async function createS3MultipartUpload(
  client: S3Client,
  config: CreateMultipartUploadCommandInput
): Promise<CreateMultipartUploadCommandOutput> {
  const response = await client.send(new CreateMultipartUploadCommand(config));

  console.log(`Upload initiated:\n\tKey:\t\t${response.Key}\n\tUpload ID:\t${response.UploadId}\n\tEncryption:\t${response.ServerSideEncryption}`);
  return response;
}
