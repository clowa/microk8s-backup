import rimraf from "rimraf";
import { log, logLevel } from "./logger";

export async function Cleanup(dirs: string[]): Promise<void> {
  log({ level: logLevel.Info, msg: "Start cleanup" });

  for (const dir of dirs) {
    await new Promise<void>((resolve, reject) => {
      try {
        rimraf(dir, () => {
          log({ level: logLevel.Info, msg: `Successfully deleted ${dir}` });
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }
  log({ level: logLevel.Info, msg: "Finished cleanup" });
}
