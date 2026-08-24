import { CreepShell } from "@/components/creep/creep-shell";

export default function CreepLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CreepShell>{children}</CreepShell>;
}
