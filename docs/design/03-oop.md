# 3 · Object-oriented design

Excerpts are copied from the file named above them, each 10 lines or fewer.

## 3.1 Abstraction

**Definition:** show what something does, and hide how.

### Example 1: a port hides the database

`backend/src/common/rate-limit.ts`:

```ts
export abstract class RateLimiter {
  abstract consume(
    key: string,
    limit: number,
    windowMs: number,
    tx?: Transaction,
  ): Promise<RateLimitDecision>;
}
```

**Why it fits:** `SessionService`, `SubmissionService` and `WriteRateLimitGuard` only ask "may this happen?". Nothing about `INSERT … ON CONFLICT`
or UNLOGGED tables reaches them, so another store would be a new class and no change to them.

### Example 2: time and randomness are abstractions

`backend/src/common/clock.ts`:

```ts
export abstract class Clock {
  abstract now(): Date;
}
```

**Why it fits:** deadlines decide most of FlowForge's behaviour. With `Clock` a test can stand one minute before a deadline and then
`clock.advance(...)` past it, without waiting.

### Example 3: an opaque transaction

`backend/src/common/transaction.ts`:

```ts
export type Transaction = { readonly [transactionBrand]: true };

export abstract class TransactionRunner {
  abstract run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}
```

**Why it fits:** services pass a transaction between modules without knowing it's a Prisma client. Only `PrismaService.client(tx)` casts it back.

## 3.2 Encapsulation

**Definition:** keep an object's data and its rules together, and control how the data changes.

### Example 1: a value object can't be built wrong

`backend/src/common/links/link-requirement.ts`:

```ts
export class LinkRequirement {
  private constructor(
    readonly required: readonly LinkType[],
    readonly optional: readonly LinkType[],
  ) {}
```

**Why it fits:** the only ways in are `LinkRequirement.from(raw)`, which validates, and the two static defaults. There's no invalid
`LinkRequirement` in the system, so `check` needn't re-check its own shape.

### Example 2: a registry's list stays private

`backend/src/course-cycles/application/publish-checks.ts`:

```ts
export class PublishChecks {
  private readonly checks: PublishCheck[] = [];

  register(check: PublishCheck): void {
    this.checks.push(check);
  }
```

**Why it fits:** a module can add a check, and nobody can remove or reorder one.

### Example 3: errors can't change after they're thrown

`backend/src/common/errors/domain-error.ts`:

```ts
export class DomainError<Code extends string = string> extends Error {
  constructor(
    public readonly code: Code,
    message: string,
    public readonly details?: readonly ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}
```

**Why it fits:** the filter trusts `code` to pick the status, so nothing may change it on the way.

### Weak spots found

The code was searched for public mutable fields on classes.

| Finding | Assessment | Action |
| --- | --- | --- |
| **Production classes:** no public mutable field. Fields are `private readonly`, `readonly` or private state such as `PublishChecks.checks` | Good | None |
| **Domain entities are interfaces with mutable fields.** `Cycle`, `Team` and `Milestone` had no `readonly`, and `RequestScope.memo` hands the same object to every caller within a request, so a mutation by one module would be seen by the next | **Real, but not exploited:** no application code assigns to them. Only a convention protected this | **[code] Fixed.** `Cycle`, `Milestone`, `Team` and `TeamMember` fields are now `readonly`, as are their `milestones` and `members` arrays. It's compile-time only, with no runtime change. The compiler found no production code assigning to them; two spec lines did, and now replace the object instead |
| **Rules live outside the data.** `Team` doesn't check its own size; `TeamRules.assertSize` does | A deliberate trade-off, not a mistake. Entities cross module boundaries as data and come from Prisma rows, and pure rule classes test with no setup. The cost is that a caller could skip a rule, so writes go through one service and the database's constraints are the final guard | Documented, not changed: moving behaviour into entities would be a refactor |
| **Test doubles expose state:** `InMemoryRefreshTokenRepository.records`, `InMemoryRateLimiter.counters` | Fine: they're `readonly` references in `testing/`, for assertions, and never imported by production code | None |
| **`request.user` is assigned by a guard** (`JwtAuthGuard`) | How Nest passes context through a request. It's read through the `@CurrentUser()` decorator only | None |

## 3.3 Inheritance

**Definition:** a class takes on another's type and behaviour, and can add to it.

### Example 1: the error hierarchy

`backend/src/teams/domain/team.errors.ts`:

```ts
export class TeamDomainError extends DomainError<TeamErrorCode> {}
```

**Why it fits:** each module adds its own set of allowed codes, checked by the compiler, and nothing else. A real "is-a": a team error **is** a domain
error, and the filter handles it as one. [Doc 2](02-class-diagrams.md#23-the-domainerror-hierarchy-and-the-single-filter) shows all nine.

### Example 2: a specialized default

`backend/src/common/rate-limit.ts`:

```ts
export class RateLimitedError extends DomainError<CommonErrorCode> {
  constructor(message = "Too many requests, try again in a minute") {
    super("TOO_MANY_REQUESTS", message);
  }
}
```

**Why it fits:** it fixes the code, so a limiter can't throw it with the wrong one.

### Example 3: extending a port

`backend/src/auth/infrastructure/google-identity.provider.ts`:

```ts
@Injectable()
export class GoogleIdentityProvider extends IdentityProvider {
  constructor(
    private readonly google: GoogleOAuthClient,
    private readonly config: AppConfig,
  ) {
    super();
  }
```

**Why it fits:** `extends` here works like `implements` with a runtime token, for the reason in [section 3.5](#35-abstract-classes-versus-interfaces). No port carries
behaviour to inherit.

**Deliberately shallow:** at most two levels below `Error`, and no class inherits logic from another service. Sharing is by composition.

## 3.4 Polymorphism

**Definition:** the same call does the right thing for different objects.

### Example 1: link validators

`backend/src/common/links/link-requirement.ts`:

```ts
      const validator = validators.for(link.type);
      if (!validator.accepts(parse(link.url))) {
        throw new LinkDomainError(
          "INVALID_LINK",
          `The ${LABELS[link.type]} link must be ${validator.expected}`,
        );
      }
```

**Why it fits:** `check` doesn't know whether it's holding a GitHub, Drive or plain https validator. The error message uses the same polymorphic `expected`.

### Example 2: to-do rules

`backend/src/dashboard/domain/student-todo-rules.ts`:

```ts
  itemsFor(context: TodoContext): TodoItem[] {
    const seen = new Set<string>();
    return this.rules
      .flatMap((rule) => rule.items(context))
      .filter((item) => !seen.has(item.key) && Boolean(seen.add(item.key)));
  }
```

**Why it fits:** four rules, one call. A new to-do is a new class.

### Example 3: the same port, a different object per environment

`backend/test/support/test-app.ts`:

```ts
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleOAuthClient)
    .useValue(google);
```

**Why it fits:** `GoogleIdentityProvider` calls `exchangeCode` the same way whether it's holding the real client or the integration tests' scripted fake.
The contract tests in [doc 4](04-solid.md#liskov-substitution) prove this substitution for four ports.

## 3.5 Abstract classes versus interfaces

Every port is an `abstract class`, and every strategy is an `interface`. This is a deliberate rule.

**Why ports are abstract classes: Nest needs a runtime token.** TypeScript interfaces don't exist at runtime, because the compiler erases them. Nest
finds a dependency from the constructor's parameter types, emitted by `emitDecoratorMetadata`:

```ts
  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly users: UsersService,
```

If `RefreshTokenRepository` were an interface, the emitted type would be `Object`, and Nest couldn't tell it from any other dependency. An interface would
need a hand-written symbol token and `@Inject(TOKEN)` on every parameter. An abstract class is its own token:

```ts
    { provide: RefreshTokenRepository, useClass: PrismaRefreshTokenRepository },
```

**Why strategies and entities are interfaces:** nothing injects them by type. `LinkValidator` instances are made with `new` and held in a registry, and
`TodoRule` likewise. A `Team` is a row's data. An interface has no runtime cost.

| Use | Choose | Example | Runtime presence |
| --- | --- | --- | --- |
| A dependency injected by Nest | `abstract class` | `TeamRepository`, `Clock` | A class, used as the token |
| A strategy built by hand | `interface` | `LinkValidator`, `TodoRule` | None |
| Data | `interface` or `type` | `Team`, `Cycle`, `CreateCycleCommand` | None |
| A framework contract | `implements` its interface | `CanActivate`, `ExceptionFilter`, `OnModuleInit` | None |

**Where in the code:** `backend/tsconfig.json` (`emitDecoratorMetadata`), `backend/src/auth/auth.module.ts`,
`backend/src/auth/application/session.service.ts`, [generated/ports.md](generated/ports.md)
