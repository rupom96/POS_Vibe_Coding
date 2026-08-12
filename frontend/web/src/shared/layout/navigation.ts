export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  description?: string;
}

export const mainNavItems: NavItem[] = [
  {
    id: 'home',
    label: 'Dashboard',
    path: '/',
    icon: '⌂',
    description: 'Module overview',
  },
  {
    id: 'pos',
    label: 'Point of Sales',
    path: '/pos',
    icon: '⊕',
    description: 'Sales & invoicing',
  },
];
