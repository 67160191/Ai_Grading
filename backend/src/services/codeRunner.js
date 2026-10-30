import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";

const MAX_CONCURRENT_RUNS = 8;
let runningCount = 0;
const waitingQueue = [];

function acquireSlot() {
  if (runningCount < MAX_CONCURRENT_RUNS) {
    runningCount++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitingQueue.push(resolve));
}

function releaseSlot() {
  runningCount--;
  if (waitingQueue.length > 0) {
    runningCount++;
    const next = waitingQueue.shift();
    next();
  }
}

/**
 * Security validator to block dangerous system APIs during coding exams
 */
function validateCodeSecurity(code, lang) {
  if (!code) return null;

  // Normalize unicode escapes (e.g. \u0052untime -> Runtime) to prevent obfuscation bypasses
  const normalizedCode = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  if (lang === "java") {
    const dangerousPatterns = [
      { pattern: /\bProcessBuilder\b/, reason: "ProcessBuilder is forbidden" },
      { pattern: /\bRuntime\s*\.\s*getRuntime/, reason: "Runtime process execution is forbidden" },
      { pattern: /\bjava\s*\.\s*lang\s*\.\s*reflect\b/, reason: "Java Reflection is forbidden" },
      { pattern: /\bClass\s*\.\s*forName\b/, reason: "Class.forName reflection is forbidden" },
      { pattern: /\bgetDeclared(Method|Field|Constructor)s?\b/, reason: "Reflection inspection is forbidden" },
      { pattern: /\bMethodHandles?\b/, reason: "MethodHandle reflection is forbidden" },
      { pattern: /\bjava\s*\.\s*net\b/, reason: "Network access is forbidden" },
      { pattern: /\bSocket\b|\bServerSocket\b/, reason: "Socket networking is forbidden" },
      { pattern: /\bHttpURLConnection\b|\bHttpClient\b|\bURL\b/, reason: "Network connection is forbidden" },
      { pattern: /\bSystem\s*\.\s*exit\b/, reason: "System.exit() is forbidden in automated grading" },
      { pattern: /\bSystem\s*\.\s*getenv\b/, reason: "System.getenv() access is forbidden" },
      { pattern: /\bSystem\s*\.\s*getProperties\b/, reason: "System properties access is forbidden" },
      { pattern: /\bSystem\s*\.\s*set(Property|Properties|SecurityManager)\b/, reason: "System configuration modification is forbidden" },
      { pattern: /\bsun\s*\.\s*misc\s*\.\s*Unsafe\b|\bjdk\s*\.\s*internal\b/, reason: "Unsafe memory operations are forbidden" },
      { pattern: /\bjava\s*\.\s*io\s*\.\s*(File|FileInputStream|FileOutputStream|FileReader|FileWriter|RandomAccessFile)\b/, reason: "File filesystem access is forbidden" },
      { pattern: /\b(FileInputStream|FileOutputStream|FileReader|FileWriter|RandomAccessFile)\b/, reason: "Direct file stream access is forbidden" },
      { pattern: /\bnew\s+File\s*\(/, reason: "Direct File creation is forbidden" },
      { pattern: /\bjava\s*\.\s*nio\s*\.\s*file\b/, reason: "NIO filesystem access is forbidden" },
      { pattern: /\b(Paths?\s*\.\s*get|Files\s*\.\s*(read|write|delete|create|new|walk|list|lines))\b/, reason: "Filesystem operations are forbidden" },
      { pattern: /\bClassLoader\b/, reason: "Custom ClassLoader is forbidden" },
    ];
    for (const { pattern, reason } of dangerousPatterns) {
      if (pattern.test(normalizedCode)) {
        return reason;
      }
    }
  } else if (lang === "python" || lang === "python3") {
    const dangerousPatterns = [
      { pattern: /\bimport\s+subprocess\b|\bfrom\s+subprocess\b/, reason: "Subprocess execution is forbidden" },
      { pattern: /\bimport\s+os\b|\bfrom\s+os\b/, reason: "OS module is forbidden" },
      { pattern: /\bimport\s+sys\b|\bfrom\s+sys\b/, reason: "Sys module is forbidden" },
      { pattern: /\bimport\s+socket\b|\bfrom\s+socket\b/, reason: "Socket networking is forbidden" },
      { pattern: /\bimport\s+urllib\b|\bimport\s+requests\b|\bimport\s+http\b/, reason: "Network requests are forbidden" },
      { pattern: /\b__import__\b/, reason: "Dynamic imports are forbidden" },
      { pattern: /\bopen\s*\(/, reason: "File I/O (open) is forbidden" },
      { pattern: /\b(eval|exec)\s*\(/, reason: "Dynamic evaluation (eval/exec) is forbidden" },
    ];
    for (const { pattern, reason } of dangerousPatterns) {
      if (pattern.test(normalizedCode)) {
        return reason;
      }
    }
  }
  return null;
}

/**
 * Execute code with input in an isolated temporary directory with timeout.
 * Supported languages: 'java', 'python', 'python3', 'javascript', 'node'
 */
export async function executeCode({
  language = "java",
  code = "",
  input = "",
  driverCode = null,
  timeoutMs = 4000,
}) {
  const lang = (language || "java").toLowerCase();

  const secError = validateCodeSecurity(code, lang);
  if (secError) {
    return {
      status: "Security Error",
      output: "",
      error: `Security Violation: ${secError}`,
      executionTimeMs: 0,
    };
  }

  await acquireSlot();
  const runId = randomBytes(8).toString("hex");
  const tempDir = path.join(os.tmpdir(), `coderunner_${runId}`);

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    if (lang === "java") {
      return await executeJava(tempDir, code, input, driverCode, timeoutMs);
    } else if (lang === "python" || lang === "python3") {
      return await executePython(tempDir, code, input, driverCode, timeoutMs);
    } else if (lang === "javascript" || lang === "js" || lang === "node") {
      return await executeJavaScript(tempDir, code, input, driverCode, timeoutMs);
    } else {
      return {
        status: "Error",
        output: "",
        error: `Language '${language}' is not supported. Supported: java, python, javascript`,
        executionTimeMs: 0,
      };
    }
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
    releaseSlot();
  }
}

/**
 * Execute Java code
 */
async function executeJava(tempDir, code, input, driverCode, timeoutMs) {
  let mainClassName = "Main";
  let filesToCompile = [];

  // Check if driverCode is provided
  if (driverCode && driverCode.trim()) {
    if (driverCode.includes("// __STUDENT_CODE__") || driverCode.includes("/* __STUDENT_CODE__ */")) {
      const merged = driverCode.replace(/\/\/\s*__STUDENT_CODE__|\/\*\s*__STUDENT_CODE__\s*\*\//g, code);
      const match = merged.match(/public\s+class\s+(\w+)/);
      mainClassName = match ? match[1] : "Main";
      const filePath = path.join(tempDir, `${mainClassName}.java`);
      fs.writeFileSync(filePath, merged, "utf-8");
      filesToCompile.push(`${mainClassName}.java`);
    } else {
      // Driver is separate class, student code is separate class
      // Detect student public class name
      const studentMatch = code.match(/public\s+class\s+(\w+)/);
      const studentClass = studentMatch ? studentMatch[1] : "Solution";
      fs.writeFileSync(path.join(tempDir, `${studentClass}.java`), code, "utf-8");
      filesToCompile.push(`${studentClass}.java`);

      const driverMatch = driverCode.match(/public\s+class\s+(\w+)/);
      mainClassName = driverMatch ? driverMatch[1] : "Main";
      fs.writeFileSync(path.join(tempDir, `${mainClassName}.java`), driverCode, "utf-8");
      filesToCompile.push(`${mainClassName}.java`);
    }
  } else {
    // Normal single-file java code
    const match = code.match(/public\s+class\s+(\w+)/);
    if (match) {
      mainClassName = match[1];
    } else {
      mainClassName = "Main";
      // Wrap in class Main if no class declaration at all
      if (!code.includes("class ")) {
        code = `public class Main {\n    public static void main(String[] args) throws Exception {\n${code}\n    }\n}`;
      }
    }
    const filePath = path.join(tempDir, `${mainClassName}.java`);
    fs.writeFileSync(filePath, code, "utf-8");
    filesToCompile.push(`${mainClassName}.java`);
  }

  // Step 1: Compile with javac
  const compileStart = Date.now();
  const compileResult = await runProcess("javac", ["-encoding", "UTF-8", ...filesToCompile], tempDir, "", 8000);

  if (compileResult.code !== 0) {
    return {
      status: "Compilation Error",
      output: "",
      error: cleanJavacError(compileResult.stderr || compileResult.stdout),
      executionTimeMs: Date.now() - compileStart,
    };
  }

  // Step 2: Run with java
  const runStart = Date.now();
  const runResult = await runProcess(
    "java",
    ["-Xmx128m", "-Xms32m", "-Dfile.encoding=UTF-8", "-cp", ".", mainClassName],
    tempDir,
    input,
    timeoutMs
  );

  const executionTimeMs = Date.now() - runStart;

  if (runResult.timedOut) {
    return {
      status: "Time Limit Exceeded (TLE)",
      output: runResult.stdout,
      error: `Execution timed out after ${timeoutMs}ms (infinite loop or slow algorithm)`,
      executionTimeMs,
    };
  }

  if (runResult.code !== 0) {
    return {
      status: "Runtime Error",
      output: runResult.stdout,
      error: cleanJavaRuntimeError(runResult.stderr),
      executionTimeMs,
    };
  }

  return {
    status: "Success",
    output: runResult.stdout,
    error: runResult.stderr,
    executionTimeMs,
  };
}

/**
 * Execute Python code
 */
async function executePython(tempDir, code, input, driverCode, timeoutMs) {
  let finalCode = code;
  if (driverCode && driverCode.trim()) {
    if (driverCode.includes("# __STUDENT_CODE__")) {
      finalCode = driverCode.replace(/#\s*__STUDENT_CODE__/g, code);
    } else {
      finalCode = `${code}\n\n${driverCode}`;
    }
  }

  const scriptPath = path.join(tempDir, "solution.py");
  fs.writeFileSync(scriptPath, finalCode, "utf-8");

  const runStart = Date.now();
  const runResult = await runProcess("python3", ["-u", "solution.py"], tempDir, input, timeoutMs);
  const executionTimeMs = Date.now() - runStart;

  if (runResult.timedOut) {
    return {
      status: "Time Limit Exceeded (TLE)",
      output: runResult.stdout,
      error: `Execution timed out after ${timeoutMs}ms`,
      executionTimeMs,
    };
  }

  if (runResult.code !== 0) {
    return {
      status: "Runtime Error",
      output: runResult.stdout,
      error: runResult.stderr,
      executionTimeMs,
    };
  }

  return {
    status: "Success",
    output: runResult.stdout,
    error: runResult.stderr,
    executionTimeMs,
  };
}

/**
 * Execute JavaScript/Node.js code
 */
async function executeJavaScript(tempDir, code, input, driverCode, timeoutMs) {
  let finalCode = code;
  if (driverCode && driverCode.trim()) {
    if (driverCode.includes("// __STUDENT_CODE__")) {
      finalCode = driverCode.replace(/\/\/\s*__STUDENT_CODE__/g, code);
    } else {
      finalCode = `${code}\n\n${driverCode}`;
    }
  }

  const scriptPath = path.join(tempDir, "solution.js");
  fs.writeFileSync(scriptPath, finalCode, "utf-8");

  const runStart = Date.now();
  const runResult = await runProcess("node", ["solution.js"], tempDir, input, timeoutMs);
  const executionTimeMs = Date.now() - runStart;

  if (runResult.timedOut) {
    return {
      status: "Time Limit Exceeded (TLE)",
      output: runResult.stdout,
      error: `Execution timed out after ${timeoutMs}ms`,
      executionTimeMs,
    };
  }

  if (runResult.code !== 0) {
    return {
      status: "Runtime Error",
      output: runResult.stdout,
      error: runResult.stderr,
      executionTimeMs,
    };
  }

  return {
    status: "Success",
    output: runResult.stdout,
    error: runResult.stderr,
    executionTimeMs,
  };
}

/**
 * Run test cases against student code
 */
export async function runTestCases({
  language = "java",
  code = "",
  testCases = [],
  driverCode = null,
  timeoutMs = 4000,
  includeHiddenDetails = false,
}) {
  if (!code || !code.trim()) {
    return {
      total: testCases.length,
      passed: 0,
      scoreRatio: 0,
      status: "No Code",
      results: [],
    };
  }

  const results = [];
  let passedCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const execRes = await executeCode({
      language,
      code,
      input: tc.input || "",
      driverCode,
      timeoutMs,
    });

    const isCompilationError = execRes.status === "Compilation Error";
    const actualNorm = normalizeOutput(execRes.output);
    const expectedNorm = normalizeOutput(tc.expected_output || "");
    const passed = !isCompilationError && execRes.status === "Success" && actualNorm === expectedNorm;

    if (passed) passedCount++;

    const isHidden = Boolean(tc.is_hidden);
    const showDetails = !isHidden || includeHiddenDetails;

    results.push({
      test_case_id: tc.id || i + 1,
      name: tc.name || `Case ${i + 1}`,
      is_hidden: isHidden,
      passed,
      status: execRes.status,
      execution_time_ms: execRes.executionTimeMs,
      // If hidden and student view, don't reveal exact input/output
      input: showDetails ? tc.input : "(Hidden Test Case)",
      expected_output: showDetails ? tc.expected_output : "(Hidden Test Case)",
      actual_output: showDetails ? execRes.output : (passed ? "(Passed)" : "(Wrong Output)"),
      error: showDetails ? execRes.error : (passed ? "" : "Failed on hidden test case"),
    });

    // If compilation error, all remaining test cases will fail with the same compilation error
    if (isCompilationError) {
      for (let j = i + 1; j < testCases.length; j++) {
        const remainingTc = testCases[j];
        const isRemHidden = Boolean(remainingTc.is_hidden);
        const remShowDetails = !isRemHidden || includeHiddenDetails;
        results.push({
          test_case_id: remainingTc.id || j + 1,
          name: remainingTc.name || `Case ${j + 1}`,
          is_hidden: isRemHidden,
          passed: false,
          status: "Compilation Error",
          execution_time_ms: 0,
          input: remShowDetails ? remainingTc.input : "(Hidden)",
          expected_output: remShowDetails ? remainingTc.expected_output : "(Hidden)",
          actual_output: "",
          error: remShowDetails ? execRes.error : "Compilation Error",
        });
      }
      break;
    }
  }

  const total = testCases.length;
  const scoreRatio = total > 0 ? passedCount / total : 1;

  return {
    total,
    passed: passedCount,
    scoreRatio,
    allPassed: passedCount === total,
    results,
  };
}

/**
 * Normalize output string for comparison (line endings, trailing whitespace)
 */
function normalizeOutput(str) {
  if (!str) return "";
  return str
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * Clean compiler and runtime errors to remove host directory paths
 */
function cleanJavacError(msg) {
  if (!msg) return "";
  return msg.replace(/\/tmp\/coderunner_[a-f0-9]+\//g, "").trim();
}

function cleanJavaRuntimeError(msg) {
  if (!msg) return "";
  return msg.replace(/\/tmp\/coderunner_[a-f0-9]+\//g, "").trim();
}

/**
 * Helper to run child process with stdin and timeout
 */
function runProcess(cmd, args, cwd, stdinText, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    // Clean execution environment: never pass application secrets (JWT_SECRET, etc.) to student code
    const cleanEnv = {
      PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      JAVA_HOME: process.env.JAVA_HOME || "",
      TZ: "Asia/Bangkok",
    };

    const child = spawn(cmd, args, { cwd, shell: false, env: cleanEnv });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutMs);

    if (stdinText) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();

    child.stdout.on("data", (data) => {
      stdout += data.toString("utf-8");
      if (stdout.length > 200000) {
        // Prevent buffer explosion
        try {
          child.kill("SIGKILL");
        } catch {}
      }
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString("utf-8");
      if (stderr.length > 200000) {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message, timedOut });
    });
  });
}

