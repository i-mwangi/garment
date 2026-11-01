import {runNativeVerification} from "./native-verification.mjs";
try{await runNativeVerification("links");}catch(error){console.error(error instanceof Error?error.message:"Native verification failed");process.exitCode=1;}
