// Test script to debug the API endpoint

async function testComposeEndpoint() {
  try {
    console.log("🧪 Testing compose endpoint...");

    const response = await fetch(
      "http://localhost:4000/mail/compose/from-message",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer demo-token",
        },
        body: JSON.stringify({
          messageId: "1",
          action: "reply",
        }),
      },
    );

    console.log("📊 Response status:", response.status);
    console.log("📊 Response headers:", Object.fromEntries(response.headers));

    const text = await response.text();
    console.log("📊 Response body:", text);

    if (!response.ok) {
      console.error("❌ Request failed");
    } else {
      console.log("✅ Request successful");
    }
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

testComposeEndpoint();
