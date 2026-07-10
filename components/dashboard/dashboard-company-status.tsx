import { cn } from "@/lib/design-system/cn";
import type { DepartmentEmployee, EmployeeActivityStatus } from "@/lib/dashboard/types";
import { ui } from "@/lib/i18n";
import { formatRelativeDate } from "@/lib/projects/utils";
import { Card } from "@/components/ui/card";

type EmployeeCardProps = {
  employee: DepartmentEmployee;
};

const STATUS_LABELS: Record<EmployeeActivityStatus, string> = {
  idle: ui.dashboard.companyStatus.idle,
  thinking: ui.dashboard.companyStatus.thinking,
  working: ui.dashboard.companyStatus.working,
  reviewing: ui.dashboard.companyStatus.reviewing,
  completed: ui.dashboard.companyStatus.completed,
};

const STATUS_COLORS: Record<EmployeeActivityStatus, string> = {
  idle: "bg-[var(--status-neutral)]",
  thinking: "bg-[var(--status-info)] animate-status-pulse",
  working: "bg-accent animate-status-pulse",
  reviewing: "bg-[var(--status-warning)] animate-status-pulse",
  completed: "bg-[var(--status-success)]",
};

function EmployeeCard({ employee }: EmployeeCardProps) {
  return (
    <Card
      variant="default"
      padding="sm"
      className="transition-all duration-[var(--motion-base)] hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--surface-muted)] text-lg ring-1 ring-[var(--border)]">
            {employee.icon}
          </div>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--background-elevated)]",
              STATUS_COLORS[employee.status],
            )}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{employee.name}</p>
          <p className="text-xs text-[var(--foreground-muted)]">
            {STATUS_LABELS[employee.status]}
          </p>
          {employee.lastActivity && (
            <p className="mt-1 text-caption truncate">
              {formatRelativeDate(employee.lastActivity)}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

type DashboardCompanyStatusProps = {
  employees: DepartmentEmployee[];
};

export function DashboardCompanyStatus({ employees }: DashboardCompanyStatusProps) {
  return (
    <section aria-labelledby="company-status-heading">
      <h2 id="company-status-heading" className="text-title text-foreground">
        {ui.dashboard.liveStatus}
      </h2>
      <p className="mt-1 text-caption">
        {ui.dashboard.departments} — {ui.dashboard.liveStatus}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {employees.map((employee, index) => (
          <div
            key={employee.id}
            className="animate-fade-up"
            style={{ animationDelay: `${index * 35}ms` }}
          >
            <EmployeeCard employee={employee} />
          </div>
        ))}
      </div>
    </section>
  );
}
