import rimraf from "rimraf";

export async function Cleanup(dirs: string[]): Promise<void> {
  console.log("Cleanup ...");

  for (const dir of dirs) {
    await new Promise<void>((resolve, reject) => {
      try {
        rimraf(dir, () => {
          console.log(`Successfully deleted ${dir}`);
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }
  console.log("Cleanup finished !");
}
