import { currentUser } from "../../../../lib/auth";
import { withApiGuard } from "../../../../lib/api-request";
export const GET = withApiGuard(async () => {
  return Response.json({ user: await currentUser() }, { headers: { "Cache-Control": "no-store" } });
});
