import { createUser, formatUser } from "./utils";
import type { User } from "./types";

export function main(): void {
  const user = createUser("Alice", "alice@example.com");
  console.log(formatUser(user));
}

export class App {
  private users: User[] = [];

  addUser(name: string, email: string): User {
    const user = createUser(name, email);
    this.users.push(user);
    return user;
  }

  getUsers(): User[] {
    return this.users;
  }
}
