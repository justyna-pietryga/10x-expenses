declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}

declare module "cloudflare:workers" {
  export const env: {
    SUPABASE_URL?: string;
    SUPABASE_KEY?: string;
  };
}
