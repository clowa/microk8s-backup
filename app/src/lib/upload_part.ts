import { CompletedPart, S3Client, UploadPartCommand, UploadPartCommandInput, UploadPartCommandOutput } from "@aws-sdk/client-s3";
import { log, logLevel } from "./logger";

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
    log(
      {
        level: logLevel.Info,
        msg: "Part uploaded",
      },
      {
        partNumber: partNumber,
        size: chunkInMB,
        ETag: uploadPartResponse.ETag,
      }
    );
  } catch (err) {
    // TODO: Check for error type.
    // TODO: Add pause
    log({ level: logLevel.Fatal, msg: `Upload of part ${partNumber} failed with error ${err}` });

    if (tryNum > maxTrys) {
      throw new Error(`Uplaod of part ${partNumber} failed. Max retrys reached.`);
    } else {
      log({ level: logLevel.Info, msg: `Retry upload of part ${partNumber}.` }, { try: tryNum });
      await uploadPart(client, config, parts, partNumber, ++tryNum);
    }
  }
}
