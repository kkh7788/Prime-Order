import { callFn } from './base';

export interface Category { id: number; name: string; sort: number; }
export interface Product {
  id: string; category_id: number; title: string;
  description: string; image: string; sort: number; available: number;
  recommended?: number;
}
export interface Sku {
  id: number; product_id: string; name: string;
  price: number; available: number; sort: number;
}

type CatalogType = 'categories' | 'products' | 'skus';

export async function listCatalog(type: CatalogType) {
  const res = await callFn<{ rows: unknown[] }>('vibe_web_catalog', { action: 'list', type });
  return res.rows;
}

export async function createCatalogItem(type: CatalogType, data: Record<string, unknown>) {
  await callFn('vibe_web_catalog', { action: 'create', type, data });
}

export async function updateCatalogItem(type: CatalogType, id: string | number, data: Record<string, unknown>) {
  await callFn('vibe_web_catalog', { action: 'update', type, id, data });
}

export async function deleteCatalogItem(type: CatalogType, id: string | number) {
  await callFn('vibe_web_catalog', { action: 'delete', type, id });
}

export async function setProductRecommendation(productId: string, recommended: boolean) {
  await callFn('vibe_web_catalog', {
    action: 'setRecommendation',
    type: 'products',
    id: productId,
    data: { recommended },
  });
}

export async function uploadProductImage(file: File): Promise<string> {
  const app = (await import('../cloudbase')).default;
  const cloudPath = `products/${Date.now()}-${file.name.replace(/\s/g, '_')}`;
  const result = await app.uploadFile({
    cloudPath,
    // @ts-expect-error 浏览器上传使用 File，SDK 类型声明仍为 string
    filePath: file,
  });
  return result.fileID;
}

export async function getImageUrl(fileID: string): Promise<string> {
  if (!fileID || fileID.startsWith('http')) return fileID;
  const app = (await import('../cloudbase')).default;
  const result = await app.getTempFileURL({ fileList: [fileID] });
  return result.fileList?.[0]?.tempFileURL ?? fileID;
}
