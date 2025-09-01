// Test the API endpoint with real message ID and corrected authentication
const testApiWithRealData = async () => {
  try {
    console.log("🧪 Testing API with real message ID...");

    const response = await fetch(
      "http://localhost:4000/mail/compose/from-message",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer demo-token", // Simple demo token that bypasses JWT
        },
        body: JSON.stringify({
          messageId: "cmezoep9l000e9z5xjmrles4z", // Real message ID from database
          action: "reply",
        }),
      },
    );

    const data = await response.json();
    console.log("✅ API Response Status:", response.status);
    console.log("📧 API Response Data:", JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log("🎉 Success! The API is working with real data.");
      console.log("📝 Compose data returned:", data);
    } else {
      console.log("❌ API Error:", data);
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
};

// Run the test
testApiWithRealData();
