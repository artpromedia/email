// Test all three compose actions: reply, replyAll, forward
const testAllComposeActions = async () => {
  const baseUrl = "http://localhost:4000/mail/compose/from-message";
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer demo-token",
  };
  const messageId = "cmezoep9l000e9z5xjmrles4z";

  console.log("🧪 Testing all compose actions...\n");

  // Test Reply
  console.log("📧 Testing REPLY...");
  try {
    const replyResponse = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messageId,
        action: "reply",
      }),
    });
    const replyData = await replyResponse.json();
    console.log("✅ Reply Status:", replyResponse.status);
    console.log("📝 Reply Subject:", replyData.subject);
    console.log("👤 Reply To:", replyData.to.join(", "));
    console.log(
      "📎 Reply Headers:",
      JSON.stringify(replyData.headers, null, 2),
    );
  } catch (error) {
    console.log("❌ Reply failed:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test Reply All
  console.log("📧 Testing REPLY ALL...");
  try {
    const replyAllResponse = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messageId,
        action: "replyAll",
      }),
    });
    const replyAllData = await replyAllResponse.json();
    console.log("✅ Reply All Status:", replyAllResponse.status);
    console.log("📝 Reply All Subject:", replyAllData.subject);
    console.log("👤 Reply All To:", replyAllData.to.join(", "));
    console.log("👥 Reply All CC:", replyAllData.cc.join(", "));
    console.log(
      "📎 Reply All Headers:",
      JSON.stringify(replyAllData.headers, null, 2),
    );
  } catch (error) {
    console.log("❌ Reply All failed:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test Forward
  console.log("📧 Testing FORWARD...");
  try {
    const forwardResponse = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messageId,
        action: "forward",
        includeAttachments: true,
        inlineCidStrategy: "preserve",
      }),
    });
    const forwardData = await forwardResponse.json();
    console.log("✅ Forward Status:", forwardResponse.status);
    console.log("📝 Forward Subject:", forwardData.subject);
    console.log(
      "👤 Forward To:",
      forwardData.to.join(", ") || "(empty - user fills)",
    );
    console.log(
      "📎 Attachments Size Exceeded:",
      forwardData.attachmentsSizeExceeded,
    );
    console.log(
      "📄 Forward Body Length:",
      forwardData.bodyHtml.length,
      "chars",
    );
    console.log(
      "🔍 Forward Body Preview:",
      forwardData.bodyHtml.substring(0, 200) + "...",
    );
  } catch (error) {
    console.log("❌ Forward failed:", error.message);
  }

  console.log("\n🎉 All compose actions tested!");
};

testAllComposeActions();
