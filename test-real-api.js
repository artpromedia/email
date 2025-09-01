// Test the mail API with real database data
const response = await fetch(
  "http://localhost:4000/mail/compose/from-message",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer demo-token",
    },
    body: JSON.stringify({
      messageId: "cmezoep9l000e9z5xjmrles4z", // Welcome to CEERION Mail message
      action: "reply",
    }),
  },
);

const result = await response.json();
console.log("✅ API Response Status:", response.status);
console.log("📧 API Response Data:", JSON.stringify(result, null, 2));
