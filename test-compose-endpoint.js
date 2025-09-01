const { execSync } = require("child_process");

// First, get the message IDs from the database
console.log("🔍 Getting message IDs from database...");

// Query to get message IDs
const query = `
SELECT id, subject, "from", "userId" 
FROM messages 
WHERE "userId" = 'cmezoep7700009z5xazcwthen' 
LIMIT 3;
`;

// Save query to temp file and execute
require("fs").writeFileSync("temp-query.sql", query);

try {
  const result = execSync("npx prisma db execute --file temp-query.sql", {
    cwd: "c:/Users/ofema/CNI/apps/api",
    encoding: "utf8",
  });

  console.log("Database query result:", result);
} catch (error) {
  console.error("Database query failed:", error.message);
}

// Clean up
try {
  require("fs").unlinkSync("temp-query.sql");
} catch (e) {}

// Test the API endpoints
const testEndpoint = async () => {
  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const demoToken =
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJkZW1vQGNlZXJpb24uY29tIiwibmFtZSI6IkRlbW8gVXNlciIsImlhdCI6MTY5MzQ0NDgwMCwiZXhwIjoxNjkzNDQ4NDAwLCJqdGkiOiJkZW1vLXRva2VuIn0.demo";

  // Test with known message ID from previous tests
  const testMessageId = "cmezoep9l000e9z5xjmrles4z";

  console.log("🧪 Testing compose endpoint...");

  const testCases = [
    { action: "reply", description: "Reply to message" },
    { action: "replyAll", description: "Reply All to message" },
    {
      action: "forward",
      description: "Forward message with attachments",
      includeAttachments: true,
    },
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n📧 Testing ${testCase.description}...`);

      const response = await fetch(
        "http://localhost:4000/mail/compose/from-message",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: demoToken,
          },
          body: JSON.stringify({
            messageId: testMessageId,
            action: testCase.action,
            includeAttachments: testCase.includeAttachments || false,
            inlineCidStrategy: "preserve",
          }),
        },
      );

      if (response.ok) {
        const result = await response.json();
        console.log(
          `✅ ${testCase.description} successful:`,
          JSON.stringify(result, null, 2),
        );
      } else {
        const error = await response.text();
        console.log(
          `❌ ${testCase.description} failed:`,
          response.status,
          error,
        );
      }
    } catch (error) {
      console.log(`❌ ${testCase.description} error:`, error.message);
    }
  }
};

testEndpoint();
