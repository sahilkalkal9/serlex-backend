const SUBROLE_DEPARTMENT_MAP = {
  sales_admin: "Sales",
  sales_manager: "Sales",
  purchase_admin: "Purchase",
  po_manager: "Purchase",
  ppc_admin: "PPC",
  ppc_manager: "PPC",
  hr_manager: "HR",
  accounts_manager: "Accounts",
  operations_manager: "Operations",
};

export const getDepartmentFromSubRole = (subRole) => {
  if (!subRole) return null;
  return SUBROLE_DEPARTMENT_MAP[subRole] || null;
};

export const shouldFilterByDepartment = (user) => {
  return user && user.role === "radmin" && !!user.subRole;
};

export const getDepartmentFilter = (user) => {
  if (!shouldFilterByDepartment(user)) return null;
  return getDepartmentFromSubRole(user.subRole);
};
