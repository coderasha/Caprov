/** Keep uploads under the API media budget (~1.5MB decoded). */
const MAX_IMAGE_BYTES = 1_500_000;

function assertImageFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are supported.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Images must be under ${Math.floor(MAX_IMAGE_BYTES / 1024)}KB. Compress the file and try again.`,
    );
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  assertImageFile(file);
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
