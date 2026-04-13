import { User } from "./types";

function validateEmail(email: string): boolean {
  return email.includes("@");
}

export function createUser(name: string, email: string): User {
  if (!validateEmail(email)) {
    throw new Error("Invalid email");
  }
  return { id: Date.now(), name, email };
}

export function formatUser(user: User): string {
  return `${user.name} <${user.email}>`;
}
