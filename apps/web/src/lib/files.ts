export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read file.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export async function readFilesAsDataUrls(files: FileList | File[]): Promise<string[]> {
  return Promise.all(Array.from(files).map((file) => readFileAsDataUrl(file)));
}
