import { supabase } from "@/integrations/supabase/client";

export const STORAGE_BUCKET = "stageos-exports";

function safeSegment(s: string) {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 60) || "x";
}

/**
 * Deterministic path scoped to the current user:
 *   {user_id}/{project_id}/v{version}-{export_id}.{ext}
 * The leading {user_id} folder is enforced by the storage RLS policies.
 */
export function buildStoragePath(opts: {
  userId: string;
  projectId: string;
  exportId: string;
  version: number;
  ext: "md" | "pdf" | "png" | "json";
}) {
  return `${opts.userId}/${safeSegment(opts.projectId)}/v${opts.version}-${safeSegment(opts.exportId)}.${opts.ext}`;
}

export async function uploadExportFile(opts: {
  path: string;
  data: Blob | ArrayBuffer | Uint8Array;
  contentType: string;
}) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(opts.path, opts.data as any, {
      contentType: opts.contentType,
      upsert: true,
    });
  if (error) throw error;
  return data;
}

export async function getSignedUrl(path: string, expiresInSec = 3600) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
}

export type StorageFileEntry = {
  path: string;
  name: string;
  size: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Recursively list every file under the current user's prefix (2-level tree). */
export async function listMyExportFiles(userId: string): Promise<StorageFileEntry[]> {
  const root = await supabase.storage.from(STORAGE_BUCKET).list(userId, {
    limit: 100,
    sortBy: { column: "updated_at", order: "desc" },
  });
  if (root.error) throw root.error;

  const out: StorageFileEntry[] = [];
  for (const entry of root.data ?? []) {
    // Folder entries have id === null in the storage list API.
    if ((entry as any).id === null || !("metadata" in entry) || !(entry as any).metadata) {
      const sub = await supabase.storage.from(STORAGE_BUCKET).list(`${userId}/${entry.name}`, {
        limit: 100,
        sortBy: { column: "updated_at", order: "desc" },
      });
      for (const f of sub.data ?? []) {
        if ((f as any).id === null) continue;
        out.push({
          path: `${userId}/${entry.name}/${f.name}`,
          name: f.name,
          size: (f as any).metadata?.size ?? null,
          createdAt: (f as any).created_at ?? null,
          updatedAt: (f as any).updated_at ?? null,
        });
      }
    } else {
      out.push({
        path: `${userId}/${entry.name}`,
        name: entry.name,
        size: (entry as any).metadata?.size ?? null,
        createdAt: (entry as any).created_at ?? null,
        updatedAt: (entry as any).updated_at ?? null,
      });
    }
  }
  return out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function deleteExportFile(path: string) {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) throw error;
}
