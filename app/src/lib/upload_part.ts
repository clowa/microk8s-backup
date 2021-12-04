import { CompletedPart, S3Client, UploadPartCommand, UploadPartCommandInput, UploadPartCommandOutput } from "@aws-sdk/client-s3";

export async function uploadPart(
  client: S3Client,
  config: UploadPartCommandInput,
  parts: CompletedPart[],
  partNumber: number,
  tryNum = 1,
  maxTrys = 3
): Promise<void> {
  let uploadPartResponse: UploadPartCommandOutput | undefined = undefined;

  try {
    uploadPartResponse = await client.send(new UploadPartCommand(config));
    // Save uploaded part
    parts.push({ PartNumber: partNumber, ETag: uploadPartResponse!.ETag });
    const chunkInMB = config.ContentLength! / 1024 / 1024;
    console.log(`Part: ${partNumber} uploaded.\n\tSize:\t${chunkInMB}\n\tETag:\t${uploadPartResponse.ETag}`);
  } catch (err) {
    // TODO: Check for error type.
    // TODO: Add pause
    console.log("Upload failed:");
    console.log(`Error: ${err}`);
    console.log(`Retry upload of part ${partNumber}`);

    if (tryNum > maxTrys) {
      throw new Error(`Uplaod of part ${partNumber} failed. Max retrys reached.`);
    } else {
      await uploadPart(client, config, parts, partNumber, ++tryNum);
    }
  }
}
