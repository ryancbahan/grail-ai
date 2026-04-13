export interface User {
  id: number;
  name: string;
  email: string;
}

export type UserRole = "admin" | "member" | "guest";
