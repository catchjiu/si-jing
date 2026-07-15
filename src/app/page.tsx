import { cookies } from "next/headers";
import { LoginForm } from "@/components/auth/login-form";
import { BusyPage } from "@/components/maintenance/busy-page";
import {
  isMaintenanceMode,
  MAINTENANCE_BYPASS_COOKIE,
} from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const bypass =
    cookieStore.get(MAINTENANCE_BYPASS_COOKIE)?.value === "1";

  if (isMaintenanceMode() && !bypass) {
    return <BusyPage />;
  }

  return <LoginForm />;
}
