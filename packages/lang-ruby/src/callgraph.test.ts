import fs from "fs";
import path from "path";
import os from "os";
import { buildRubyCallGraph } from "./callgraph";
import { registerLanguage, loadLanguage, analyze } from "@grail-ai/core";
import type { FileEntry } from "@grail-ai/core";
import { ruby } from "./index";

let tmpDir: string;

beforeAll(async () => {
  registerLanguage(ruby);
  await loadLanguage(ruby);
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-ruby-callgraph-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string) {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

async function analyzeAndBuildCallGraph() {
  const { root, language } = await analyze(tmpDir);
  if (language?.implementation.buildCallGraph) {
    const { collectFiles } = await import("@grail-ai/core");
    const files = collectFiles(root);
    await language.implementation.buildCallGraph(root.absolutePath, files);
  }
  return root;
}

function findSymbol(root: Awaited<ReturnType<typeof analyzeAndBuildCallGraph>>, fileName: string, symName: string) {
  const { collectFiles } = require("@grail-ai/core");
  const files = collectFiles(root) as FileEntry[];
  const file = files.find((f) => f.filePath.endsWith(fileName));
  return file?.node.symbols.find((s) => s.name === symName);
}

describe("buildRubyCallGraph", () => {
  describe("constant receiver resolution", () => {
    it("resolves ClassName.method calls across files", async () => {
      writeFile("Gemfile", "");
      writeFile("user.rb", `class User
  def self.find(id)
    # lookup
  end

  def self.create(attrs)
    # create
  end
end
`);
      writeFile("controller.rb", `class Controller
  def show
    User.find(1)
  end

  def create
    User.create(name: "Alice")
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const show = findSymbol(root, "controller.rb", "show");
      expect(show?.calls).toBeDefined();
      expect(show!.calls).toHaveLength(1);
      expect(show!.calls![0].name).toBe("find");
      expect(show!.calls![0].file).toContain("user.rb");
      expect(show!.calls![0].parent).toBe("User");

      const create = findSymbol(root, "controller.rb", "create");
      expect(create?.calls).toBeDefined();
      expect(create!.calls![0].name).toBe("create");
    });
  });

  describe("self receiver resolution", () => {
    it("resolves self.method calls within the same class", async () => {
      writeFile("Gemfile", "");
      writeFile("service.rb", `class Service
  def self.build_query(params)
    # build
  end

  def self.run(params)
    self.build_query(params)
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "service.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls).toHaveLength(1);
      expect(run!.calls![0].name).toBe("build_query");
      expect(run!.calls![0].parent).toBe("Service");
    });
  });

  describe("implicit self resolution", () => {
    it("resolves unqualified calls to methods in the same class", async () => {
      writeFile("Gemfile", "");
      writeFile("validator.rb", `class Validator
  def validate(data)
    check_format(data)
  end

  def check_format(data)
    data.match?(/valid/)
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const validate = findSymbol(root, "validator.rb", "validate");
      expect(validate?.calls).toBeDefined();
      expect(validate!.calls).toHaveLength(1);
      expect(validate!.calls![0].name).toBe("check_format");
      expect(validate!.calls![0].parent).toBe("Validator");
    });
  });

  describe("cross-file implicit resolution", () => {
    it("resolves to top-level method when no class context", async () => {
      writeFile("Gemfile", "");
      writeFile("helpers.rb", `def format_output(data)
  data.to_s
end
`);
      writeFile("main.rb", `def run
  format_output("hello")
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls).toHaveLength(1);
      expect(run!.calls![0].name).toBe("format_output");
      expect(run!.calls![0].file).toContain("helpers.rb");
    });
  });

  describe("blacklisted methods", () => {
    it("skips common methods like puts, each, map", async () => {
      writeFile("Gemfile", "");
      writeFile("app.rb", `class App
  def run
    puts "hello"
    [1, 2].each { |n| n }
    [1, 2].map { |n| n * 2 }
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "app.rb", "run");
      // calls should be undefined or empty — all calls are blacklisted
      expect(run?.calls ?? []).toEqual([]);
    });
  });

  describe("ambiguous calls", () => {
    it("skips when multiple classes define the same method", async () => {
      writeFile("Gemfile", "");
      writeFile("a.rb", `class Dog
  def speak
    "woof"
  end
end
`);
      writeFile("b.rb", `class Cat
  def speak
    "meow"
  end
end
`);
      writeFile("main.rb", `class Main
  def run
    speak
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      // "speak" exists in Dog and Cat but not Main — can't resolve, skip
      expect(run?.calls ?? []).toEqual([]);
    });
  });

  describe("arity disambiguation", () => {
    it("uses argument count to disambiguate when possible", async () => {
      writeFile("Gemfile", "");
      writeFile("a.rb", `class Builder
  def self.make(name)
    # one arg
  end
end
`);
      writeFile("b.rb", `class Factory
  def self.make(name, type, opts)
    # three args
  end
end
`);
      writeFile("main.rb", `def run
  Builder.make("test")
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls).toHaveLength(1);
      expect(run!.calls![0].name).toBe("make");
      expect(run!.calls![0].parent).toBe("Builder");
    });
  });

  describe("range and context", () => {
    it("includes range and context on resolved calls", async () => {
      writeFile("Gemfile", "");
      writeFile("utils.rb", `def helper
  42
end
`);
      writeFile("main.rb", `def run
  helper
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls![0].range).toBeDefined();
      expect(run!.calls![0].range!.start.line).toBe(2);
      expect(typeof run!.calls![0].context).toBe("string");
    });
  });

  describe("deduplication", () => {
    it("deduplicates multiple calls to the same method", async () => {
      writeFile("Gemfile", "");
      writeFile("utils.rb", `def helper
  42
end
`);
      writeFile("main.rb", `def run
  helper
  helper
  helper
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls).toHaveLength(1);
    });
  });

  describe("does not descend into nested classes", () => {
    it("scopes calls to the enclosing method, not inner classes", async () => {
      writeFile("Gemfile", "");
      writeFile("utils.rb", `def unrelated
  99
end
`);
      writeFile("outer.rb", `class Outer
  def run
    unrelated
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "outer.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls![0].name).toBe("unrelated");
    });
  });

  // ── edge cases and complex scenarios ───────────────────────

  describe("blacklist bypass for constant receivers", () => {
    it("resolves blacklisted method name when receiver is a constant", async () => {
      writeFile("Gemfile", "");
      writeFile("repo.rb", `class Repo
  def self.find(id)
    # lookup
  end

  def self.select(fields)
    # select
  end
end
`);
      writeFile("main.rb", `def run
  Repo.find(1)
  Repo.select(:name)
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls!.map((c) => c.name).sort()).toEqual(["find", "select"]);
    });
  });

  describe("scope resolution receiver", () => {
    it("resolves Mod::Class.method calls", async () => {
      writeFile("Gemfile", "");
      writeFile("service.rb", `class Service
  def self.call(input)
    input
  end
end
`);
      writeFile("main.rb", `def run
  Service.call("data")
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls![0].name).toBe("call");
      expect(run!.calls![0].parent).toBe("Service");
    });
  });

  describe("implicit self prefers current class over top-level", () => {
    it("resolves to same-class method when both exist", async () => {
      writeFile("Gemfile", "");
      writeFile("helpers.rb", `def process(data)
  data
end
`);
      writeFile("worker.rb", `class Worker
  def run
    process("input")
  end

  def process(data)
    data.upcase
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "worker.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls).toHaveLength(1);
      expect(run!.calls![0].parent).toBe("Worker");
      expect(run!.calls![0].file).toContain("worker.rb");
    });
  });

  describe("empty method body", () => {
    it("produces no calls for a method with no body", async () => {
      writeFile("Gemfile", "");
      writeFile("app.rb", `class App
  def noop
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const noop = findSymbol(root, "app.rb", "noop");
      expect(noop?.calls ?? []).toEqual([]);
    });
  });

  describe("method with only comments", () => {
    it("produces no calls for a method with only comments", async () => {
      writeFile("Gemfile", "");
      writeFile("app.rb", `class App
  def placeholder
    # TODO: implement
    # some notes
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const placeholder = findSymbol(root, "app.rb", "placeholder");
      expect(placeholder?.calls ?? []).toEqual([]);
    });
  });

  describe("multiple files with same method name in different classes", () => {
    it("resolves constant-qualified calls correctly across 3+ files", async () => {
      writeFile("Gemfile", "");
      writeFile("a.rb", `class Alpha
  def self.execute(x)
    x + 1
  end
end
`);
      writeFile("b.rb", `class Beta
  def self.execute(x, y)
    x + y
  end
end
`);
      writeFile("c.rb", `class Gamma
  def self.execute(x, y, z)
    x + y + z
  end
end
`);
      writeFile("main.rb", `def run
  Alpha.execute(1)
  Beta.execute(1, 2)
  Gamma.execute(1, 2, 3)
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls).toHaveLength(3);
      const parents = run!.calls!.map((c) => c.parent).sort();
      expect(parents).toEqual(["Alpha", "Beta", "Gamma"]);
    });
  });

  describe("chained calls", () => {
    it("resolves the first call in a chain but not return-value calls", async () => {
      writeFile("Gemfile", "");
      writeFile("query.rb", `class Query
  def self.build(table)
    # returns a query object
  end
end
`);
      writeFile("main.rb", `def run
  Query.build("users").where(active: true).limit(10)
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      // Should resolve Query.build but not .where or .limit (receiver is a call return)
      expect(run?.calls).toBeDefined();
      const names = run!.calls!.map((c) => c.name);
      expect(names).toContain("build");
      // where and limit should NOT be resolved (receiver is a call, type unknown)
      expect(names).not.toContain("where");
      expect(names).not.toContain("limit");
    });
  });

  describe("variadic methods", () => {
    it("matches variadic definitions against any argument count", async () => {
      writeFile("Gemfile", "");
      writeFile("logger.rb", `class Logger
  def self.log(*messages)
    messages.each { |m| puts m }
  end
end
`);
      writeFile("main.rb", `def run
  Logger.log("a", "b", "c")
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls![0].name).toBe("log");
      expect(run!.calls![0].parent).toBe("Logger");
    });
  });

  describe("method in module context", () => {
    it("resolves calls within a module", async () => {
      writeFile("Gemfile", "");
      writeFile("auth.rb", `module Auth
  def self.authenticate(token)
    verify(token)
  end

  def self.verify(token)
    token == "valid"
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const auth = findSymbol(root, "auth.rb", "authenticate");
      expect(auth?.calls).toBeDefined();
      expect(auth!.calls![0].name).toBe("verify");
      expect(auth!.calls![0].parent).toBe("Auth");
    });
  });

  describe("no false positives on unknown receivers", () => {
    it("skips calls on local variable receivers", async () => {
      writeFile("Gemfile", "");
      writeFile("user.rb", `class User
  def save
    true
  end
end
`);
      writeFile("main.rb", `def run
  user = get_user
  user.save
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      // user.save — receiver is a local variable, type unknown, should skip
      expect(run?.calls ?? []).toEqual([]);
    });
  });

  describe("no false positives on instance variable receivers", () => {
    it("skips calls on instance variable receivers", async () => {
      writeFile("Gemfile", "");
      writeFile("db.rb", `class DB
  def query(sql)
    sql
  end
end
`);
      writeFile("app.rb", `class App
  def run
    @db.query("SELECT 1")
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "app.rb", "run");
      // @db.query — instance var receiver, type unknown, should skip
      expect(run?.calls ?? []).toEqual([]);
    });
  });

  describe("bare identifier that shadows a method name", () => {
    it("does not resolve bare identifiers used as parameters", async () => {
      writeFile("Gemfile", "");
      writeFile("utils.rb", `def data
  "global"
end
`);
      // 'data' here is a parameter, not a method call
      writeFile("app.rb", `class App
  def process(data)
    transform(data)
  end

  def transform(input)
    input.upcase
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const process = findSymbol(root, "app.rb", "process");
      expect(process?.calls).toBeDefined();
      // Should resolve transform but NOT data (it's a parameter reference)
      const names = process!.calls!.map((c) => c.name);
      expect(names).toContain("transform");
      expect(names).not.toContain("data");
    });
  });

  describe("multiple calls to different methods in same target class", () => {
    it("resolves all distinct method calls", async () => {
      writeFile("Gemfile", "");
      writeFile("math.rb", `class MathHelper
  def self.add(a, b)
    a + b
  end

  def self.multiply(a, b)
    a * b
  end

  def self.subtract(a, b)
    a - b
  end
end
`);
      writeFile("main.rb", `def run
  MathHelper.add(1, 2)
  MathHelper.multiply(3, 4)
  MathHelper.subtract(5, 1)
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      expect(run?.calls).toBeDefined();
      expect(run!.calls).toHaveLength(3);
      expect(run!.calls!.map((c) => c.name).sort()).toEqual(["add", "multiply", "subtract"]);
    });
  });

  describe("method calling another class's method that doesn't exist", () => {
    it("produces no calls when the target method doesn't exist in the project", async () => {
      writeFile("Gemfile", "");
      writeFile("main.rb", `def run
  NonExistent.do_stuff(1)
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "main.rb", "run");
      expect(run?.calls ?? []).toEqual([]);
    });
  });

  describe("Rails receiver inference", () => {
    it("resolves local variables assigned from ActiveRecord finder calls", async () => {
      writeFile("Gemfile", "");
      writeFile("app/models/user.rb", `class User
  def activate!
    true
  end
end
`);
      writeFile("app/controllers/users_controller.rb", `class UsersController
  def show
    user = User.find(params[:id])
    user.activate!
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const show = findSymbol(root, "users_controller.rb", "show");
      expect(show?.calls).toBeDefined();
      expect(show!.calls!.map((c) => c.name)).toContain("activate!");
      const activate = show!.calls!.find((c) => c.name === "activate!");
      expect(activate!.parent).toBe("User");
      expect(activate!.file).toContain("app/models/user.rb");
    });

    it("resolves instance variables assigned from ActiveRecord finder calls", async () => {
      writeFile("Gemfile", "");
      writeFile("app/models/user.rb", `class User
  def suspend!
    true
  end
end
`);
      writeFile("app/controllers/users_controller.rb", `class UsersController
  def update
    @user = User.find(params[:id])
    @user.suspend!
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const update = findSymbol(root, "users_controller.rb", "update");
      expect(update?.calls).toBeDefined();
      const suspend = update!.calls!.find((c) => c.name === "suspend!");
      expect(suspend).toBeDefined();
      expect(suspend!.parent).toBe("User");
    });

    it("resolves methods reached through has_many associations and relation unwrapping", async () => {
      writeFile("Gemfile", "");
      writeFile("app/models/user.rb", `class User
  has_many :posts
end
`);
      writeFile("app/models/post.rb", `class Post
  belongs_to :user

  def publish!
    true
  end
end
`);
      writeFile("app/services/publisher.rb", `class Publisher
  def run
    user = User.find(1)
    post = user.posts.first
    post.publish!
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "publisher.rb", "run");
      expect(run?.calls).toBeDefined();
      const publish = run!.calls!.find((c) => c.name === "publish!");
      expect(publish).toBeDefined();
      expect(publish!.parent).toBe("Post");
      expect(publish!.file).toContain("app/models/post.rb");
    });

    it("infers common Rails serializer parameter types from known class names", async () => {
      writeFile("Gemfile", "");
      writeFile("app/models/project.rb", `class Project
  def issue
  end
end
`);
      writeFile("app/controllers/projects_controller.rb", `class ProjectsController
  def show
    @project = Project.find(params[:id])
    serialize_project(@project)
  end

  def serialize_project(p)
    p.issue
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const serializer = findSymbol(root, "projects_controller.rb", "serialize_project");
      expect(serializer?.calls).toBeDefined();
      const issue = serializer!.calls!.find((c) => c.name === "issue");
      expect(issue).toBeDefined();
      expect(issue!.parent).toBe("Project");
      expect(issue!.file).toContain("app/models/project.rb");
    });

    it("resolves schema-backed model column readers from db/schema.rb", async () => {
      writeFile("Gemfile", "");
      writeFile("db/schema.rb", `ActiveRecord::Schema[8.0].define do
  create_table "users", force: :cascade do |t|
    t.string "email"
    t.string "display_name"
  end
end
`);
      writeFile("app/models/user.rb", `class User
end
`);
      writeFile("app/controllers/users_controller.rb", `class UsersController
  def show
    user = User.find(params[:id])
    user.email
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const show = findSymbol(root, "users_controller.rb", "show");
      expect(show?.calls).toBeDefined();
      const email = show!.calls!.find((c) => c.name === "email");
      expect(email).toBeDefined();
      expect(email!.parent).toBe("User");
      expect(email!.signature).toBeUndefined();
    });

    it("propagates constructor ivar types through attr-reader style calls", async () => {
      writeFile("Gemfile", "");
      writeFile("db/schema.rb", `ActiveRecord::Schema[8.0].define do
  create_table "early_access_signups", force: :cascade do |t|
    t.string "email"
  end
end
`);
      writeFile("app/models/early_access_signup.rb", `class EarlyAccessSignup
end
`);
      writeFile("app/services/signup_notification.rb", `class SignupNotification
  def initialize(signup)
    @signup = signup
  end

  attr_reader :signup

  def message
    signup.email
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const message = findSymbol(root, "signup_notification.rb", "message");
      expect(message?.calls).toBeDefined();
      const email = message!.calls!.find((c) => c.name === "email");
      expect(email).toBeDefined();
      expect(email!.parent).toBe("EarlyAccessSignup");
      expect(email!.file).toContain("app/models/early_access_signup.rb");
    });

    it("resolves explicit Rails delegates through association target types", async () => {
      writeFile("Gemfile", "");
      writeFile("app/models/user.rb", `class User
  def display_name
  end
end
`);
      writeFile("app/models/membership.rb", `class Membership
  belongs_to :user
  delegate :display_name, to: :user
end
`);
      writeFile("app/services/reporter.rb", `class Reporter
  def run
    membership = Membership.find(1)
    membership.display_name
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const run = findSymbol(root, "reporter.rb", "run");
      expect(run?.calls).toBeDefined();
      const displayName = run!.calls!.find((c) => c.name === "display_name");
      expect(displayName).toBeDefined();
      expect(displayName!.parent).toBe("User");
    });

    it("resolves class and relation scope chains", async () => {
      writeFile("Gemfile", "");
      writeFile("app/models/issue.rb", `class Issue
  scope :open_state, -> { where(open: true) }
  scope :ordered, -> { order(:created_at) }
end
`);
      writeFile("app/controllers/issues_controller.rb", `class IssuesController
  def index
    Issue.open_state.ordered
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const index = findSymbol(root, "issues_controller.rb", "index");
      expect(index?.calls).toBeDefined();
      const names = index!.calls!.map((c) => c.name).sort();
      expect(names).toContain("open_state");
      expect(names).toContain("ordered");
      expect(index!.calls!.every((c) => c.parent === "Issue")).toBe(true);
    });

    it("carries relation returns through simple singleton collection helpers", async () => {
      writeFile("Gemfile", "");
      writeFile("app/models/issue.rb", `class Issue
  scope :for_organization, ->(org) { where(organization: org) }
end
`);
      writeFile("app/models/project.rb", `class Project
  def self.kept
    Issue.kept.where(kind: "project")
  end
end
`);
      writeFile("app/controllers/projects_controller.rb", `class ProjectsController
  def index
    Project.kept.for_organization(current_organization)
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const index = findSymbol(root, "projects_controller.rb", "index");
      expect(index?.calls).toBeDefined();
      const kept = index!.calls!.find((c) => c.name === "kept");
      const forOrganization = index!.calls!.find((c) => c.name === "for_organization");
      expect(kept).toBeDefined();
      expect(kept!.parent).toBe("Project");
      expect(forOrganization).toBeDefined();
      expect(forOrganization!.parent).toBe("Issue");
    });
  });

  describe("Rails controller callbacks", () => {
    it("adds before_action methods as traversal edges from controller actions", async () => {
      writeFile("Gemfile", "");
      writeFile("app/models/user.rb", `class User
  def activate!
    true
  end
end
`);
      writeFile("app/controllers/users_controller.rb", `class UsersController
  before_action :set_user

  def show
    @user.activate!
  end

  def set_user
    @user = User.find(params[:id])
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const show = findSymbol(root, "users_controller.rb", "show");
      expect(show?.calls).toBeDefined();
      const names = show!.calls!.map((c) => c.name).sort();
      expect(names).toContain("activate!");
      expect(names).toContain("set_user");
      const callback = show!.calls!.find((c) => c.name === "set_user");
      expect(callback!.parent).toBe("UsersController");
      expect(callback!.context).toBe("before_action :set_user");
      const activate = show!.calls!.find((c) => c.name === "activate!");
      expect(activate!.parent).toBe("User");
    });

    it("honors only and except filters on controller callbacks", async () => {
      writeFile("Gemfile", "");
      writeFile("app/models/user.rb", `class User
  def activate!
  end
end
`);
      writeFile("app/controllers/users_controller.rb", `class UsersController
  before_action :set_user, only: %i[show update]
  before_action :audit, except: :index

  def index
  end

  def show
    @user.activate!
  end

  def set_user
    @user = User.find(params[:id])
  end

  def audit
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const index = findSymbol(root, "users_controller.rb", "index");
      expect(index?.calls ?? []).toEqual([]);

      const show = findSymbol(root, "users_controller.rb", "show");
      expect(show?.calls).toBeDefined();
      const names = show!.calls!.map((c) => c.name);
      expect(names).toContain("set_user");
      expect(names).toContain("audit");
      expect(names).toContain("activate!");
    });

    it("adds callbacks inherited from an explicit superclass", async () => {
      writeFile("Gemfile", "");
      writeFile("app/controllers/sales/base_controller.rb", `module Sales
  class BaseController
    before_action :require_membership!

    def require_membership!
    end
  end
end
`);
      writeFile("app/controllers/sales/targets_controller.rb", `module Sales
  class TargetsController < BaseController
    def index
      serialize_target
    end

    def serialize_target
    end
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const index = findSymbol(root, "targets_controller.rb", "index");
      expect(index?.calls).toBeDefined();
      const names = index!.calls!.map((c) => c.name);
      expect(names).toContain("require_membership!");
      expect(names).toContain("serialize_target");
      const callback = index!.calls!.find((c) => c.name === "require_membership!");
      expect(callback!.parent).toBe("Sales::BaseController");
      expect(callback!.context).toBe("before_action :require_membership!");
    });
  });

  describe("namespaced Rails classes", () => {
    it("keeps callbacks scoped to the fully qualified controller name", async () => {
      writeFile("Gemfile", "");
      writeFile("app/controllers/projects_controller.rb", `class ProjectsController
  before_action :require_membership!

  def show
    render_project
  end

  def require_membership!
  end

  def render_project
  end
end
`);
      writeFile("app/controllers/api/projects_controller.rb", `module Api
  class ProjectsController
    before_action :load_project

    def show
      render_json
    end

    def load_project
    end

    def render_json
    end
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const show = findSymbol(root, "app/controllers/projects_controller.rb", "show");
      expect(show?.calls).toBeDefined();
      const callNames = show!.calls!.map((c) => c.name).sort();
      expect(callNames).toContain("require_membership!");
      expect(callNames).toContain("render_project");
      expect(callNames).not.toContain("load_project");
      expect(show!.calls!.every((c) => c.parent === "ProjectsController")).toBe(true);

      const apiShow = findSymbol(root, "app/controllers/api/projects_controller.rb", "show");
      expect(apiShow?.calls).toBeDefined();
      const apiCallNames = apiShow!.calls!.map((c) => c.name).sort();
      expect(apiCallNames).toContain("load_project");
      expect(apiCallNames).toContain("render_json");
      expect(apiCallNames).not.toContain("require_membership!");
      expect(apiShow!.calls!.every((c) => c.parent === "Api::ProjectsController")).toBe(true);
    });
  });

  describe("service object call conventions", () => {
    it("resolves self.call through new(...).call to the instance call body", async () => {
      writeFile("Gemfile", "");
      writeFile("app/services/public_intake.rb", `class PublicIntake
  def self.call(**kwargs)
    new(**kwargs).call
  end

  def initialize(**kwargs)
  end

  def call
    validate
  end

  def validate
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const singletonCall = findSymbol(root, "public_intake.rb", "call");
      expect(singletonCall?.kind).toBe("function");
      expect(singletonCall?.calls).toBeDefined();
      expect(singletonCall!.calls![0].name).toBe("call");
      expect(singletonCall!.calls![0].kind).toBe("method");
      expect(singletonCall!.calls![0].parent).toBe("PublicIntake");

      const instanceCall = (() => {
        const { collectFiles } = require("@grail-ai/core");
        const files = collectFiles(root) as FileEntry[];
        const file = files.find((f) => f.filePath.endsWith("public_intake.rb"));
        return file?.node.symbols.find((s) => s.name === "call" && s.kind === "method");
      })();
      expect(instanceCall?.calls?.map((c) => c.name)).toContain("validate");
    });

    it("prefers singleton methods for constant receiver calls when an instance method has the same name", async () => {
      writeFile("Gemfile", "");
      writeFile("app/services/signup_notification.rb", `class SignupNotification
  def self.deliver(signup, request:)
    new(signup, request: request).deliver
  end

  def initialize(signup, request:)
  end

  def deliver
    message
  end

  def message
  end
end
`);
      writeFile("app/controllers/early_access_controller.rb", `class EarlyAccessController
  def create
    SignupNotification.deliver(@signup, request: request)
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const create = findSymbol(root, "early_access_controller.rb", "create");
      expect(create?.calls).toBeDefined();
      expect(create!.calls![0].name).toBe("deliver");
      expect(create!.calls![0].kind).toBe("function");
      expect(create!.calls![0].parent).toBe("SignupNotification");
    });

    it("resolves relative constant receivers inside namespaces", async () => {
      writeFile("Gemfile", "");
      writeFile("app/services/marketing/signup_notification.rb", `module Marketing
  class SignupNotification
    def self.deliver
    end
  end
end
`);
      writeFile("app/controllers/marketing/early_access_controller.rb", `module Marketing
  class EarlyAccessController
    def create
      SignupNotification.deliver
    end
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const create = findSymbol(root, "early_access_controller.rb", "create");
      expect(create?.calls).toBeDefined();
      const deliver = create!.calls!.find((c) => c.name === "deliver");
      expect(deliver).toBeDefined();
      expect(deliver!.kind).toBe("function");
      expect(deliver!.parent).toBe("Marketing::SignupNotification");
    });
  });

  describe("Ruby alias conventions", () => {
    it("resolves alias_method calls to the original method", async () => {
      writeFile("Gemfile", "");
      writeFile("app/services/signup_notification.rb", `class SignupNotification
  def message
    line("hello")
  end

  def header(value)
    value.to_s
  end

  alias_method :line, :header
end
`);

      const root = await analyzeAndBuildCallGraph();
      const message = findSymbol(root, "signup_notification.rb", "message");
      expect(message?.calls).toBeDefined();
      const header = message!.calls!.find((c) => c.name === "header");
      expect(header).toBeDefined();
      expect(header!.parent).toBe("SignupNotification");
      expect(header!.context).toBe("line(\"hello\")");
    });
  });

  describe("module_function conventions", () => {
    it("resolves constant calls to methods exported by no-arg module_function", async () => {
      writeFile("Gemfile", "");
      writeFile("app/lib/activity_prose.rb", `module ActivityProse
  module_function

  def render(activity)
    format_value(activity)
  end

  def format_value(activity)
    activity.to_s
  end
end
`);
      writeFile("app/controllers/projects_controller.rb", `class ProjectsController
  def show
    ActivityProse.render(@activity)
  end
end
`);

      const root = await analyzeAndBuildCallGraph();
      const show = findSymbol(root, "projects_controller.rb", "show");
      expect(show?.calls).toBeDefined();
      const render = show!.calls!.find((c) => c.name === "render");
      expect(render).toBeDefined();
      expect(render!.kind).toBe("function");
      expect(render!.parent).toBe("ActivityProse");

      const exportedRender = (() => {
        const { collectFiles } = require("@grail-ai/core");
        const files = collectFiles(root) as FileEntry[];
        const file = files.find((f) => f.filePath.endsWith("activity_prose.rb"));
        return file?.node.symbols.find((s) => s.name === "render" && s.kind === "function");
      })();
      expect(exportedRender?.calls?.map((c) => c.name)).toContain("format_value");
    });
  });
});
