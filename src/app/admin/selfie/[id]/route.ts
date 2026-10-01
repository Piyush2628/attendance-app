import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX = "data:image/jpeg;base64,";

/** A punch selfie as a JPEG. Row-level security limits it to the owner of the employee. */
export async function GET(_: Request, ctx: RouteContext<"/admin/selfie/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase.from("punch_selfies").select("image").eq("id", id).maybeSingle();
  if (!data?.image.startsWith(PREFIX)) return new Response(null, { status: 404 });

  return new Response(Buffer.from(data.image.slice(PREFIX.length), "base64"), {
    headers: {
      "Content-Type": "image/jpeg",
      // A selfie never changes; keep it in this browser only.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
