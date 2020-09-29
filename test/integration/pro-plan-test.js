const FakeTimers = require("@sinonjs/fake-timers");
const { beforeEach, test } = require("tap");
const simple = require("simple-mock");
const nock = require("nock");
nock.disableNetConnect();

// disable Probot logs, bust be set before requiring probot
process.env.LOG_LEVEL = "fatal";
const { Probot, ProbotOctokit } = require("probot");

const app = require("../../");

beforeEach(function (done) {
  delete process.env.APP_NAME;
  process.env.DISABLE_STATS = "true";
  process.env.DISABLE_WEBHOOK_EVENT_CHECK = "true";
  process.env.WIP_DISABLE_MEMORY_USAGE = "true";

  FakeTimers.install({ toFake: ["Date"] });

  this.probot = new Probot({
    id: 1,
    githubToken: "test",
    Octokit: ProbotOctokit.defaults({
      throttle: { enabled: false },
      retry: { enabled: false },
    }),
  });

  this.probot.logger.info = simple.mock();
  this.probot.logger.child = simple.mock().returnWith(this.probot.logger);

  this.probot.load(app);

  done();
});

test('new pull request with "Test" title', async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has no config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(404)

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, { check_runs: [] })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.name, "WIP");
      t.is(createCheckParams.status, "completed");
      t.is(createCheckParams.started_at, "1970-01-01T00:00:00.000Z");
      t.is(createCheckParams.completed_at, "1970-01-01T00:00:00.000Z");
      t.is(createCheckParams.status, "completed");
      t.is(createCheckParams.conclusion, "success");
      t.is(createCheckParams.output.title, "Ready for review");
      t.match(
        createCheckParams.output.summary,
        /No match found based on configuration/
      );
      t.match(
        createCheckParams.output.text,
        /the default configuration is applied/
      );

      return true;
    })
    .reply(201, {});

  await this.probot
    .receive(require("./events/new-pull-request-with-test-title.json"))
    .catch(t.error);

  t.is(this.probot.logger.info.lastCall.args[1], "✅ wip/app#1");
  t.is(this.probot.logger.info.callCount, 1);

  t.deepEqual(this.probot.logger.child.lastCall.arg, {
    name: "WIP",
    account: 1,
    plan: "pro",
    repo: 1,
    private: false,
    event: "pull_request",
    action: "opened",
    wip: false,
    change: true,
    override: null,
    location: null,
    match: null,
    hasConfig: false,
  });

  t.deepEqual(mock.activeMocks(), []);
});

test('new pull request with "[WIP] Test" title', async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has no config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(404)

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, { check_runs: [] })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.status, "in_progress");
      t.is(createCheckParams.output.title, 'Title contains "WIP"');
      t.match(
        createCheckParams.output.summary,
        /The title "\[WIP\] Test" contains "WIP"/
      );
      t.match(
        createCheckParams.output.summary,
        /You can override the status by adding "@wip ready for review"/
      );

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-wip-title.json")
  );

  // check resulting logs
  const logParams = this.probot.logger.child.lastCall.arg;
  t.is(logParams.wip, true);
  t.is(logParams.change, true);
  t.is(logParams.location, "title");
  t.is(logParams.match, "WIP");

  t.deepEqual(mock.activeMocks(), []);
});

test('pending pull request with "Test" title', async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has no config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(404)

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          status: "pending",
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.status, "completed");
      t.is(createCheckParams.conclusion, "success");

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-test-title.json")
  );

  // check resulting logs
  const logParams = this.probot.logger.child.lastCall.arg;
  t.is(logParams.wip, false);
  t.is(logParams.change, true);

  t.deepEqual(mock.activeMocks(), []);
});

test('ready pull request with "[WIP] Test" title', async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has no config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(404)

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          conclusion: "success",
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.status, "in_progress");

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-wip-title.json")
  );

  // check resulting logs
  const logParams = this.probot.logger.child.lastCall.arg;
  t.is(logParams.wip, true);
  t.is(logParams.change, true);

  t.deepEqual(mock.activeMocks(), []);
});

test('pending pull request with "[WIP] Test" title', async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has no config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(404)

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          status: "pending",
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] });

  await this.probot.receive(
    require("./events/new-pull-request-with-wip-title.json")
  );

  // check resulting logs
  const logParams = this.probot.logger.child.lastCall.arg;
  t.is(logParams.wip, true);
  t.is(logParams.change, false);

  t.deepEqual(mock.activeMocks(), []);
});

test('ready pull request with "Test" title', async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has no config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(404)

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          conclusion: "success",
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] });

  await this.probot.receive(
    require("./events/new-pull-request-with-test-title.json")
  );

  // check resulting logs
  const logParams = this.probot.logger.child.lastCall.arg;
  t.is(logParams.wip, false);
  t.is(logParams.change, false);

  t.deepEqual(mock.activeMocks(), []);
});

test("custom term: 🚧", async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(200, "terms: 🚧")

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          conclusion: "success",
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.name, "WIP");
      t.is(createCheckParams.status, "in_progress");
      t.is(createCheckParams.completed_at, undefined);
      t.is(createCheckParams.status, "in_progress");
      t.is(
        createCheckParams.output.title,
        "Title contains a construction emoji"
      );
      t.match(
        createCheckParams.output.summary,
        /The title "🚧 Test" contains "🚧"/
      );
      t.match(
        createCheckParams.output.summary,
        /You can override the status by adding "@wip ready for review"/
      );
      t.match(createCheckParams.output.text, /<td>🚧<\/td>/);

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-emoji-title.json")
  );

  // check resulting logs
  t.is(
    this.probot.logger.info.lastCall.args[1],
    '⏳ wip/app#1 - "🚧" found in title'
  );
  t.is(this.probot.logger.info.callCount, 1);
  t.deepEqual(this.probot.logger.child.lastCall.arg, {
    name: "WIP",
    account: 1,
    repo: 1,
    private: false,
    plan: "pro",
    event: "pull_request",
    action: "opened",
    wip: true,
    change: true,
    override: null,
    location: "title",
    match: "🚧",
    hasConfig: true,
  });

  t.deepEqual(mock.activeMocks(), []);
});

test("custom term: 🚧NoSpace", async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(200, "terms: 🚧")

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          conclusion: "success",
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.name, "WIP");
      t.is(createCheckParams.status, "in_progress");
      t.is(createCheckParams.completed_at, undefined);
      t.is(createCheckParams.status, "in_progress");
      t.is(
        createCheckParams.output.title,
        "Title contains a construction emoji"
      );
      t.match(
        createCheckParams.output.summary,
        /The title "🚧Test" contains "🚧"/
      );
      t.match(
        createCheckParams.output.summary,
        /You can override the status by adding "@wip ready for review"/
      );
      t.match(createCheckParams.output.text, /<td>🚧<\/td>/);
      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-emoji-no-space-title.json")
  );

  // check resulting logs
  t.is(
    this.probot.logger.info.lastCall.args[1],
    '⏳ wip/app#1 - "🚧" found in title'
  );
  t.is(this.probot.logger.info.callCount, 1);
  t.deepEqual(this.probot.logger.child.lastCall.arg, {
    name: "WIP",
    account: 1,
    repo: 1,
    private: false,
    plan: "pro",
    event: "pull_request",
    action: "opened",
    wip: true,
    change: true,
    override: null,
    location: "title",
    match: "🚧",
    hasConfig: true,
  });

  t.deepEqual(mock.activeMocks(), []);
});

test("custom location: label_name", async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(200, "locations: label_name")

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          conclusion: "success",
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.status, "in_progress");
      t.match(
        createCheckParams.output.summary,
        /The label "WIP" contains "WIP"/
      );
      t.match(
        createCheckParams.output.summary,
        /You can override the status by adding "@wip ready for review"/
      );
      t.is(createCheckParams.output.title, 'Label contains "WIP"');
      t.match(createCheckParams.output.text, /<td>label_name<\/td>/);

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-wip-label.json")
  );

  // check resulting logs
  const logParams = this.probot.logger.child.lastCall.arg;
  t.is(logParams.location, "label_name");
  t.is(logParams.match, "WIP");

  t.deepEqual(mock.activeMocks(), []);
});

test("custom location: commits", async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(200, "locations: commit_subject")

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [
      {
        commit: {
          message: "WIP: test",
        },
      },
    ])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          conclusion: "success",
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.status, "in_progress");
      t.match(
        createCheckParams.output.summary,
        /The commit subject "WIP: test" contains "WIP"/
      );
      t.match(
        createCheckParams.output.summary,
        /You can override the status by adding "@wip ready for review"/
      );
      t.match(createCheckParams.output.text, /<td>commit_subject<\/td>/);

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-wip-label.json")
  );

  // check resulting logs
  const logParams = this.probot.logger.child.lastCall.arg;
  t.is(logParams.location, "commit_subject");
  t.is(logParams.match, "WIP");

  t.deepEqual(mock.activeMocks(), []);
});

test("complex config", async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(
      200,
      `
- terms:
  - 🚧
  - WIP
  locations:
  - title
  - label_name
- terms:
  - fixup!
  - squash!
  locations: commit_subject`
    )

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [
      {
        commit: {
          message: "fixup! test",
        },
      },
      {
        commit: {
          message: "test",
        },
      },
    ])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          conclusion: "success",
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.status, "in_progress");
      t.match(
        createCheckParams.output.summary,
        /The commit subject "fixup! test" contains "fixup!"/
      );
      t.match(
        createCheckParams.output.summary,
        /You can override the status by adding "@wip ready for review"/
      );
      t.match(createCheckParams.output.text, /<td>commit_subject<\/td>/);

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-test-title.json")
  );

  // check resulting logs
  const logParams = this.probot.logger.child.lastCall.arg;
  t.is(logParams.location, "commit_subject");
  t.is(logParams.match, "fixup!");

  t.deepEqual(mock.activeMocks(), []);
});

test("loads config from .github repository", async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has config in .github repository
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(200, "terms: 🚧")

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs")
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-emoji-title.json")
  );

  t.deepEqual(mock.activeMocks(), []);
});

test("loads commits once only", async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has config in .github repository
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(
      200,
      `
- terms: 'foo'
  locations: commit_subject
- terms: 'bar'
  locations: commit_subject`
    )

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [
      {
        commit: {
          message: "test",
        },
      },
    ])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs")
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-test-title.json")
  );

  t.deepEqual(mock.activeMocks(), []);
});

test("override", async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, { check_runs: [] })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.status, "completed");
      t.is(createCheckParams.conclusion, "success");
      t.is(createCheckParams.output.title, "Ready for review (override)");
      t.match(
        createCheckParams.output.summary,
        /The status has been set to success by adding `@wip ready for review` to the pull request comment/
      );

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-wip-title-and-override.json")
  );

  // check resulting logs
  t.is(this.probot.logger.info.lastCall.args[1], "❗️ wip/app#1");
  const logParams = this.probot.logger.child.lastCall.arg;
  t.is(logParams.wip, false);
  t.is(logParams.override, true);
  t.is(logParams.change, true);

  t.deepEqual(mock.activeMocks(), []);
});

test("pending pull request with override", async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has no config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(404)

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          status: "in_progress",
          output: {
            title: "Ready for review (override)",
          },
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.status, "completed");
      t.is(createCheckParams.conclusion, "success");
      t.is(createCheckParams.output.title, "Ready for review");
      t.match(
        createCheckParams.output.summary,
        /No match found based on configuration/
      );

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-test-title.json")
  );

  // check resulting logs
  const logParams = this.probot.logger.child.lastCall.arg;
  t.is(logParams.wip, false);
  t.is(logParams.change, true);

  t.deepEqual(mock.activeMocks(), []);
});

test('pending pull request with override and "[WIP] test" title', async function (t) {
  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has no config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(404)

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP",
    })
    .reply(200, {
      check_runs: [
        {
          status: "in_progress",
          output: {
            title: "Ready for review (override)",
          },
        },
      ],
    })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.status, "in_progress");

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-wip-title.json")
  );

  // check resulting logs
  const logParams = this.probot.logger.child.lastCall.arg;

  t.is(logParams.wip, true);
  t.is(logParams.change, true);

  t.deepEqual(mock.activeMocks(), []);
});

test("custom APP_NAME", async function (t) {
  simple.mock(process.env, "APP_NAME", "WIP (local-dev)");

  const mock = nock("https://api.github.com")
    // has pro plan
    .get("/marketplace_listing/accounts/1")
    .reply(200, {
      marketplace_purchase: {
        plan: {
          price_model: "FLAT_RATE",
        },
      },
    })

    // has no config
    .get("/repos/wip/app/contents/.github%2Fwip.yml")
    .reply(404)
    .get("/repos/wip/.github/contents/.github%2Fwip.yml")
    .reply(404)

    // List commits on a pull request
    // https://docs.github.com/en/rest/reference/pulls#list-commits-on-a-pull-request
    .get("/repos/wip/app/pulls/1/commits")
    .reply(200, [])

    // check for current status
    .get("/repos/wip/app/commits/sha123/check-runs")
    .query({
      check_name: "WIP (local-dev)",
    })
    .reply(200, { check_runs: [] })

    // get combined status
    // https://docs.github.com/en/rest/reference/repos#get-the-combined-status-for-a-specific-reference
    .get("/repos/wip/app/commits/sha123/status")
    .reply(200, { statuses: [] })

    // create new check run
    .post("/repos/wip/app/check-runs", (createCheckParams) => {
      t.is(createCheckParams.name, "WIP (local-dev)");

      return true;
    })
    .reply(201, {});

  await this.probot.receive(
    require("./events/new-pull-request-with-test-title.json")
  );
  simple.restore();

  // t.is(this.probot.logger.child.lastCall.arg.name, "WIP (local-dev)");

  t.deepEqual(mock.activeMocks(), []);
});
