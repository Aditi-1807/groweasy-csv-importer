const { mapRowHeuristics } = require('./utils/aiExtractor');

const testCases = [
  {
    input: {
      "Full Name": "John Doe",
      "Email Address": "john.doe@example.com",
      "Contact No": "+91 9876543210",
      "Date Created": "2026-05-13 14:20:48",
      "Company Name": "GrowEasy",
      "City": "Mumbai",
      "State": "Maharashtra",
      "Country": "India",
      "Status": "GOOD_LEAD_FOLLOW_UP",
      "Source": "leads_on_demand"
    },
    expectedStatus: "success",
    expectedName: "John Doe",
    expectedEmail: "john.doe@example.com",
    expectedMobile: "9876543210",
    expectedCountryCode: "+91"
  },
  {
    input: {
      "Name": "Sarah",
      "Emails": "sarah.johnson@example.com, sarah.alt@example.com",
      "Phones": "+919876543211 ; +911111122222",
      "Lead Status": "not answered"
    },
    expectedStatus: "success",
    expectedName: "Sarah",
    expectedEmail: "sarah.johnson@example.com",
    expectedMobile: "9876543211",
    expectedCrmStatus: "DID_NOT_CONNECT"
  },
  {
    input: {
      "Client": "Invalid Row",
      "Company": "No contact info"
    },
    expectedStatus: "skipped",
    expectedReason: "Record lacks both email and mobile number"
  }
];

let passed = 0;
testCases.forEach((tc, idx) => {
  console.log(`Running Test Case ${idx + 1}...`);
  const result = mapRowHeuristics(tc.input);
  
  if (result.status !== tc.expectedStatus) {
    console.error(`❌ Test failed: expected status ${tc.expectedStatus}, got ${result.status}`);
    return;
  }
  
  if (tc.expectedStatus === 'skipped') {
    if (result.skip_reason !== tc.expectedReason) {
      console.error(`❌ Test failed: expected reason "${tc.expectedReason}", got "${result.skip_reason}"`);
      return;
    }
  } else {
    const d = result.data;
    if (tc.expectedName && d.name !== tc.expectedName) {
      console.error(`❌ Test failed: expected name "${tc.expectedName}", got "${d.name}"`);
      return;
    }
    if (tc.expectedEmail && d.email !== tc.expectedEmail) {
      console.error(`❌ Test failed: expected email "${tc.expectedEmail}", got "${d.email}"`);
      return;
    }
    if (tc.expectedMobile && d.mobile_without_country_code !== tc.expectedMobile) {
      console.error(`❌ Test failed: expected mobile "${tc.expectedMobile}", got "${d.mobile_without_country_code}"`);
      return;
    }
    if (tc.expectedCountryCode && d.country_code !== tc.expectedCountryCode) {
      console.error(`❌ Test failed: expected country code "${tc.expectedCountryCode}", got "${d.country_code}"`);
      return;
    }
    if (tc.expectedCrmStatus && d.crm_status !== tc.expectedCrmStatus) {
      console.error(`❌ Test failed: expected CRM status "${tc.expectedCrmStatus}", got "${d.crm_status}"`);
      return;
    }
  }
  
  console.log(`\nTest Case ${idx + 1} passed!`);
  passed++;
});

console.log(`\nTests completed: ${passed}/${testCases.length} passed.`);
process.exit(passed === testCases.length ? 0 : 1);
