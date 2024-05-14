const lancedb = require("vectordb");
import {
  CreateTableOptions,
  EmbeddingFunction,
  Table,
  WriteMode,
  Connection,
} from "vectordb";

// eslint-disable-next-line @typescript-eslint/naming-convention
import * as vscode from "vscode";
import { getPythonInterpreter, getWorkSpaceFolder } from "./utils";
import { copilotUtilsSubfolderName } from "./initUtils";
import { copilotFIles } from "./filesToInit";
import { spawn } from "child_process";
const workspaceFolder = getWorkSpaceFolder();
const pythonInterpreter = getPythonInterpreter();
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

function generateEmbedding(textToEmbed: string): Promise<[number[]]> {
  console.log({ textToEmbed });
  const sanitizedTextToEmbed = textToEmbed
    ?.replace(/\\/g, "\\\\")
    ?.replace(/"/g, '\\"')
    ?.replace(/\$/g, "\\$");
  return new Promise((resolve, reject) => {
    const command = `${pythonInterpreter} ${workspaceFolder}/${copilotFIles.embedUtilFile.workspaceRelativeFilepath} "${sanitizedTextToEmbed}"`;

    const pythonProcess = spawn(command, { shell: true });
    // const pythonProcess = spawn('python', ['path/to/your_script.py', text]);

    let output = "";
    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      console.error("stderr:", data.toString());
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}`));
      } else {
        try {
          const embedding: [number[]] = JSON.parse(output);
          resolve(embedding);
        } catch (e) {
          reject(e);
        }
      }
    });
  });
}

// interface EmbedFunction extends EmbeddingFunction<string[]> {
//   sourceColumn: string;
// }

// interface EmbeddingFunction {
//   sourceColumn: string;
//   embed: EmbedFunction;
// }
// const embedFunctionJS: EmbeddingFunction<string> = {
//   sourceColumn: "text",
//   embed: async function (batch): Promise<number[][]> {
//     const { pipeline } = await import("@xenova/transformers");
//     const pipe = await pipeline(
//       "feature-extraction",
//       "Xenova/all-MiniLM-L6-v2",
//     );
//     let result: number[][] = [];
//     for (let text of batch) {
//       const res = await pipe(text, { pooling: "mean", normalize: true });
//       result.push(Array.from(res["data"]));
//     }
//     return result;
//   },
// };

const embedFunctionPython: EmbeddingFunction<{
  vector: number[];
  fileLineNumber: number;
  fileLineContent: string;
  filePath: string;
}> = {
  sourceColumn: "text",
  embed: async function (
    batch: {
      vector: number[];
      fileLineNumber: number;
      fileLineContent: string;
      filePath: string;
    }[],
  ): Promise<number[][]> {
    // const { pipeline } = await import("@xenova/transformers");
    // const pipe = await pipeline(
    //   "feature-extraction",
    //   "Xenova/all-MiniLM-L6-v2",
    // );
    let result: number[][] = [];
    for (let text of batch) {
      // const res = await pipe(text, { pooling: "mean", normalize: true });
      const vector = await generateEmbedding(text.fileLineContent);
      result.push(Array.from(vector[0]));
    }
    return result;
  },
};
async function vectorizeResources() {
  try {
    const workspaceFolder = getWorkSpaceFolder();
    const db: Connection = await lancedb.connect(
      `${workspaceFolder}/data/my_db`,
    );

    let files = await vscode.workspace.findFiles("**/resources/**/*");
    console.log("dsjhfiou4");
    // const resourcesTable = await db.createTable(
    //   "resources",
    //   [
    //     {
    //       vector: [3.1, 4.1],
    //       fileLineNumber: 0,
    //       fileLineContent: "Hello World",
    //       filePath: "none",
    //     },
    //   ],
    //   "overwrite",
    // );
    const data = [];
    for (const file of files) {
      const pageContent = await vscode.workspace.fs.readFile(file);
      // const lines = content.toString().split("\n");
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1_000,
        chunkOverlap: 20,
      });
      const textChunks = await textSplitter.splitText(pageContent.toString());
      if (textChunks?.length > 0) {
        for (let i = 0; i < textChunks.length; i++) {
          const line = textChunks[i];
          console.log({
            line,
            finePath: file.path.replace(workspaceFolder || "", ""),
          });
          const vector = await generateEmbedding(line);
          // console.log({ vector, line, i });
          // if (vector) {
          // await resourcesTable.add({
          //   // @ts-ignore
          data.push({
            vector: vector[0],
            fileLineNumber: i,
            fileLineContent: line,
            filePath: file.path.replace(workspaceFolder || "", ""),
          });
          // });
          // }
        }
      }
    }
    const resourcesTable = await db.createTable("resources", data, {
      writeMode: WriteMode.Overwrite,
    });
    // const hasNamespace = await this.hasNamespace(namespace);
    // if (hasNamespace) {
    //   const collection = await client.openTable(namespace);
    //   await collection.add(data);
    //   return true;
    // }

    // await client.createTable(namespace, data);
    // return true;
    // const resourcesTable = await db.createTable<{
    //   vector: number[];
    //   fileLineNumber: number;
    //   fileLineContent: string;
    //   filePath: string;
    // }>({
    //   name: "resources",
    //   data,
    //   embeddingFunction: embedFunctionPython,
    //   writeOptions: { writeMode: WriteMode.Overwrite },
    // });
    console.log({ resourcesTable });
  } catch (error) {
    console.error(error, "ldaskjfo");
  }
}

export async function queryVectorizedResources(queryString: string) {
  const workspaceFolder = getWorkSpaceFolder();
  const db: Connection = await lancedb.connect(`${workspaceFolder}/data/my_db`);
  console.log(await db.tableNames());

  let files = await vscode.workspace.findFiles("**/resources/**/*");

  for (const file of files) {
    const content = await vscode.workspace.fs.readFile(file);
    console.log("hf9uewhdcisj");
    const vector: any = await generateEmbedding(queryString);
    const parsedVec = vector;
    console.log("fidsoajodsjia");
    console.log({ file, content, vector, parsedVec });

    console.log({ vector, queryString }, 2);
    if (vector) {
      const table = await db.openTable("resources", embedFunctionPython);
      const results = await table
        .search({
          fileLineContent: queryString,
          filePath: "",
          fileLineNumber: 0,
          vector: vector,
        })
        .limit(2)
        .execute();
      console.log({ results });
    }
  }
}

export default vectorizeResources;
