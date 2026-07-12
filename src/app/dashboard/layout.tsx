import { DashboardNav } from "@/components/layout/dashboard-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col lg:flex-row">
      <DashboardNav />
      <main className="min-w-0 w-full flex-1 overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-6xl animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
