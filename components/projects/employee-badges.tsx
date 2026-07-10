import { resolveAssignedEmployee } from "@/lib/employees/registry";
import type { AssignedEmployeeRef } from "@/lib/projects/types";

type EmployeeBadgesProps = {
  employees: readonly AssignedEmployeeRef[];
};

export function EmployeeBadges({ employees }: EmployeeBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {employees.map((id) => {
        const assignee = resolveAssignedEmployee(id);

        return (
          <span
            key={id}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset sm:text-xs ${assignee.colorClass}`}
            title={assignee.description}
          >
            {assignee.name}
          </span>
        );
      })}
    </div>
  );
}
