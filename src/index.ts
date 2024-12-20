import { Hono } from "hono";
import { Client } from "@neondatabase/serverless";
import { env } from "hono/adapter";

const app = new Hono()

app.get("/test", async (c) => {
  const body = await c.req.json();
  console.log(body);
  return c.json({
    message: "Hello from cloudflare"
  }, 200);
});

app.post('/:webhook', async (c) => {
  try {
    const { DATABASE_URL } = env<{ DATABASE_URL: string }>(c);
    const client = new Client(DATABASE_URL);
    await client.connect();

    // Fetch project idea and test for event type
    const { webhook } = c.req.param();
    const event = c.req.header('X-GitHub-Event');

    // Deserializing the entire payload
    const payload = await c.req.json();
    console.log(payload);

    switch (event) {
      // For onboarding repository, we can setup webhook for each one and 
      // populate the database for each project 
      case 'ping':
        try {
          const query = `INSERT INTO "Project" ("repoId", "webhook", "title") VALUES ($1, $2, $3)`;
          const values = [payload.repository.id, webhook, payload.repository.name];
          await client.query(query, values);
          return c.json({}, 200);
        } catch (error) {
          console.log(error);
          return c.json({}, 500);
        }
      // For handling of issue labelling, unlabelling, assigning, unassigning
      case 'issues':
        const action = payload.action;
        switch (action) {
          // Insertion for labelling an issue as AMWOC
          case "labeled":
            const wocLabelAdded = payload.label.name === "AMWOC";
            if (wocLabelAdded !== true) {
              return c.json({}, 200);
            }
            try {
              const query = `INSERT INTO "Issue" ("issueId", "repoId", "url") VALUES($1, $2, $3)`;
              const values = [payload.issue.id, payload.issue.url, payload.repository.id];
              await client.query(query, values);
              return c.json({}, 200);
            } catch (error) {
              return c.json({}, 500);
            }

          // Deletion for unlabelling an issue which was AMWOC
          case "unlabeled":
            const wocLabelRemoved = payload.label.name === "AMWOC";
            if (wocLabelRemoved !== true) {
              return c.json({}, 200);
            }
            try {
              const query = `DELETE FROM "Issue" WHERE "issueId" = $1`;
              const values = [payload.issue.id];
              await client.query(query, values);
              return c.json({}, 200);
            } catch (error) {
              return c.json({
                message: "Internal Server Error",
              }, 500);
            }

          // Updation of issue for assignment
          case "assigned":
            try {
              await client.query("BEGIN");

              const checkQuery = `SELECT EXISTS(SELECT 1 from "Issue" WHERE "issueId" = $1`;
              const checkResult = await client.query(checkQuery, [payload.issue.id]);

              if (!checkResult.rows[0].exists) {
                await client.query("COMMIT");
                return c.json({}, 200);
              }

              const updateQuery = `UPDATE "Issue" SET "claimedBy" = $1 WHERE "issueId" = $2`;
              const updateValues = [payload.issue.assignee, payload.issue.id];
              await client.query(updateQuery, updateValues);

              await client.query("COMMIT");

              return c.json({}, 200);
            } catch (error) {
              await client.query("ROLLBACK");
              console.log(error);
              return c.json({
                message: "Internal Server Error",
              }, 500);
            }
          // Updation of issue for unassignment
          case "unassigned":
            try {
              await client.query("BEGIN");

              const checkQuery = `SELECT EXISTS(SELECT 1 from "Issue" WHERE "issueId" = $1`;
              const checkResult = await client.query(checkQuery, [payload.issue.id]);

              if (!checkResult.rows[0].exists) {
                await client.query("COMMIT");
                return c.json({}, 200);
              }

              const updateQuery = `UPDATE "Issue" SET "claimedBy" = NULL WHERE "issueId" = $1`;
              await client.query(updateQuery, [payload.issue.id]);
              await client.query("COMMIT");

              return c.json({}, 200);
            } catch (error) {
              await client.query("ROLLBACK");
              console.log(error);
              return c.json({
                message: "Internal Server Error",
              }, 500);
            }
          case "closed":
            try {
              await client.query("BEGIN");

              const checkQuery = `SELECT EXISTS(SELECT 1 from "Issue" WHERE "issueId" = $1`;
              const checkResult = await client.query(checkQuery, [payload.issue.id]);

              if (!checkResult.rows[0].exists) {
                await client.query("COMMIT");
                return c.json({}, 200);
              }

              const updateQuery = `UPDATE "Issue" SET "issueStatus" = false WHERE "issueId" = $1`;
              await client.query(updateQuery, [payload.issue.id]);
              await client.query("COMMIT");
              return c.json({}, 200);
            } catch (error) {
              await client.query("ROLLBACK");
              console.log(error);
              return c.json({
                message: "Internal Server Error",
              }, 500);
            }
          case "reopened":
            try {
              await client.query("BEGIN");

              const checkQuery = `SELECT EXISTS(SELECT 1 from "Issue" WHERE "issueId" = $1`;
              const checkResult = await client.query(checkQuery, [payload.issue.id]);

              if (!checkResult.rows[0].exists) {
                await client.query("COMMIT");
                return c.json({}, 200);
              }

              const updateQuery = `UPDATE "Issue" SET "issueStatus" = false WHERE "issueId" = $1`;
              await client.query(updateQuery, [payload.issue.id]);
              await client.query("COMMIT");
              return c.json({}, 200);
            } catch (error) {
              await client.query("ROLLBACK");
              console.log(error);
              return c.json({
                message: "Internal Server Error",
              }, 500);
            }
          default:
            break;
        }
      case 'issue_comment':
        try {

          return c.status(200); // Success
        } catch (error) {

        }
      case 'pull_request':
        try {

          return c.status(200); // Success
        } catch (error) {

        }
      default:
        return c.status(200); // Success
    }
  } catch (error) {
    return c.json({
      message: "Internal Server Error",
    }, 500);
  }
});

/*
 * WebHook for the following things:
 * 1. Issue comments
 * 2. Labels (Label created, edited or deleted)
 * 3. Pull Request Reviews
 */

export default app

/* -- Bounty Manager
 * "/bounty 25 @IAmRiteshKoushik"
 */
