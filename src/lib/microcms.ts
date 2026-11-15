export interface MicroCMSImage {
  url: string;
  height?: number;
  width?: number;
}

export interface BlogCategory {
  id: string;
  name?: string;
}

export interface Blog {
  id: string;
  title: string;
  content: string;
  eyecatch?: MicroCMSImage;
  category?: BlogCategory;
  publishedAt: string;
  updatedAt: string;
}

interface BlogListResponse {
  contents: Blog[];
  totalCount: number;
  offset: number;
  limit: number;
}

const apiUrl = "https://junko.microcms.io/api/v1/blogs";

export async function getBlogs(): Promise<Blog[]> {
  const apiKey = import.meta.env.MICROCMS_API_KEY;

  if (!apiKey) {
    throw new Error("MICROCMS_API_KEY is not configured.");
  }

  const response = await fetch(`${apiUrl}?limit=100&orders=-publishedAt`, {
    headers: {
      "X-MICROCMS-API-KEY": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load blog posts from microCMS: ${response.status}`);
  }

  const data = (await response.json()) as BlogListResponse;
  return data.contents;
}
