import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorageService } from './file-storage.service';

describe('FileStorageService', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'repomax-files-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('stores and removes a local file using its object key', async () => {
    const config = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          FILE_STORAGE_DRIVER: 'local',
          FILE_LOCAL_DIRECTORY: directory,
        };
        return values[key];
      }),
    };
    const service = new FileStorageService(config as never);
    const key = 'products/product-id/image.png';
    const content = Buffer.from('repomax-image');

    await service.upload(key, content, 'image/png');

    const path = service.getLocalPath(key);
    await expect(readFile(path)).resolves.toEqual(content);
    await expect(service.getContent(key)).resolves.toEqual({ localPath: path });

    await service.remove(key);

    await expect(access(path)).rejects.toThrow();
  });
});
