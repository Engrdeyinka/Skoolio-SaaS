import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://vuacujvzizfuuzbzkbhj.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YWN1anZ6aXpmdXV6YnprYmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Mzk3NTcsImV4cCI6MjA4OTExNTc1N30.j1u_GV5sW4KI1RsGlcREKcbyGr3dg7QO_1E4c9ouECU";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars. Make sure your .env file is set up.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupSchema() {
  console.log("Setting up vault_schema fields...");

  const fields = [
    { label: "Registration Number", key: "registration_number", required: false },
    { label: "Centre Code", key: "centre_code", required: false },
    { label: "School Address", key: "school_address", required: false },
    { label: "Principal Name", key: "principal_name", required: false },
    { label: "Contact Email", key: "contact_email", required: false },
    { label: "Contact Phone", key: "contact_phone", required: false },
  ];

  try {
    // Check if fields already exist
    const { data: existing } = await supabase.from("vault_schema").select("*");

    if (existing && existing.length > 0) {
      console.log("Schema fields already exist:");
      existing.forEach(f => console.log(`  - ${f.label}`));
      return;
    }

    // Insert the fields
    const { error } = await supabase.from("vault_schema").insert(fields);

    if (error) {
      console.error("Error inserting fields:", error);
      process.exit(1);
    }

    console.log("✅ Successfully added vault schema fields:");
    fields.forEach(f => console.log(`  - ${f.label}`));
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
}

setupSchema();
