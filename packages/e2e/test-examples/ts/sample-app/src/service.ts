import { User } from "./types";

export class UserService {
  private users: User[] = [];

  add(user: User): void {
    this.users.push(user);
  }

  findByEmail(email: string): User | undefined {
    return this.users.find((u) => u.email === email);
  }

  count(): number {
    return this.users.length;
  }
}
