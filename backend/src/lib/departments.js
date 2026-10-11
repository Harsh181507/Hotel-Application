// Who does what. Front-desk roles see everything; department roles only see
// the work routed to their department (they never see guest chats).
export const DESK_ROLES = ['admin', 'reception'];
export const DEPARTMENT_ROLES = ['housekeeping', 'kitchen', 'maintenance'];
export const ALL_ROLES = [...DESK_ROLES, ...DEPARTMENT_ROLES];

export const DEPARTMENTS = ['reception', 'housekeeping', 'kitchen', 'maintenance'];
export const DEPARTMENT_LABELS = {
  reception: 'the front desk',
  housekeeping: 'housekeeping',
  kitchen: 'the kitchen',
  maintenance: 'maintenance',
};

// Which department handles each kind of guest request.
export const DEPARTMENT_FOR_TYPE = {
  housekeeping: 'housekeeping',
  amenities: 'housekeeping',
  food: 'kitchen',
  maintenance: 'maintenance',
  other: 'reception',
};

export const isDesk = (user) => DESK_ROLES.includes(user.role);

// The department a staff member works in (null for front-desk roles).
export const departmentOf = (user) => (DEPARTMENT_ROLES.includes(user.role) ? user.role : null);
