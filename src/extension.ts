// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import {
  promptAgent,
  updateLexicon,
  parseApiResponse,
  fetchVerse,
  updateVerse,
} from "./utils";
import vectorizeResources, { queryVectorizedResources } from "./vectorization";
import { generatePythonEnv, generateFilesInWorkspace } from "./initUtils";
import {
  CodeLensArgs,
  SelectionCodeLensProvider,
  editFile,
  showDiffWithOriginal,
} from "./projectEditingTools";
import { generateFiles } from "./fileUtils";
import { SidebarProvider } from "./SidebarProvider";
// import { HelloWorldPanel } from "./panels/HelloWorldPanel";

const grammar = require("usfm-grammar");
const dotenv = require("dotenv");
const path = require("path");

const result = dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

if (result.error) {
  throw result.error;
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Required environment variables are not set");
}

export enum AgentFunctionName {
  updateLexicon = "updateLexicon",
  updateVerse = "updateVerse",
  queryResources = "queryResources",
}

const tools: {
  name: string;
  input: string[];
  toolDescription: string;
  example: string;
}[] = [
  {
    name: AgentFunctionName.updateLexicon,
    input: ["old_string", "new_string"],
    toolDescription:
      "This tool allows you to update a lexicon entry by replacing an old string with a new string.",
    example: "{name: 'updateLexicon', input: ['old_string', 'new_string']}",
  },
  {
    name: AgentFunctionName.updateVerse,
    input: ["verse_reference", "new_verse_text"],
    toolDescription:
      "This tool allows you to update a verse by providing the verse reference and the new verse text.",
    example:
      "{name: 'updateVerse', input: ['John 3:16', 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.']}",
  },
  {
    name: AgentFunctionName.queryResources,
    input: ["query_string"],
    toolDescription:
      "This tool allows you to query resources by providing a query string. It performs a vector search in the lancedb vector database.",
    example: "{name: 'queryResources', input: ['Genesis 1:1']}",
  },
];

const agentFunctions: any = {
  [AgentFunctionName.updateLexicon]: async function (
    ...args: Parameters<typeof updateLexicon>
  ) {
    await updateLexicon(...args);
    console.log("updateLexicon was called");
  },
  [AgentFunctionName.updateVerse]: async function (
    ...args: Parameters<typeof updateVerse>
  ) {
    await updateVerse(...args);
    console.log("updateVerse was called");
  },
  [AgentFunctionName.queryResources]: async function (
    ...args: Parameters<typeof fetchVerse>
  ) {
    await fetchVerse(...args);
    console.log("fetchVerse was called");
  },
};

enum CommandName {
  translatorsCopilot = "translatorsCopilot",
  createVectorDB = "createVectorDB",
  initFiles = "initFiles",
  editFiles = "editFiles",
  askResources = "askResources",
  processSelection = "processSelection",
  openUsfmConverter = "openUsfmConverter",
}

const registerCommand = ({
  context,
  commandName,
  executable,
}: {
  context: vscode.ExtensionContext;
  commandName: CommandName;
  executable: (args?: any) => Promise<void>;
}) => {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      `genesis-translator.${commandName}`,
      async (args) => {
        try {
          await executable(args);
        } catch (error) {
          console.error({ commandName, error });
          vscode.window.showErrorMessage("error when running: " + commandName);
        }
      },
    ),
  );
};

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarProvider(context.extensionUri);
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
  );
  // item.text = "$(beaker) Add Todo";
  // item.command = "vstodo.addTodo";
  item.show();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "genesis-translator-sidebar",
      sidebarProvider,
    ),
  );
  registerCommand({
    context,
    commandName: CommandName.translatorsCopilot,
    executable: async () => {
      vscode.window
        .showInputBox({
          prompt: "What can I help you with in your translation project?",
          placeHolder: "Enter your instruction here",
        })
        .then(async (userQuery) => {
          if (userQuery === undefined || userQuery === "") {
            vscode.window.showInformationMessage("No input provided");
          } else {
            if (vscode.workspace.workspaceFolders !== undefined) {
              try {
                const prompt = `
							You are a helpful assistant. Try to answer the user query below by using one of your tools. Pay attention to the input required by each tool.
							## Tools
							${tools.map((tool) => tool.name).join("\n")}
							## Instruction
							${userQuery}
							Please use the following format in your response:
							
							/* Action: */
							${tools.map((tool) => JSON.stringify(tool)).join("\n")}
							
							
							The Action name must be an exact match and the input should match the format of the example given. 
              Only respond with a value that matches the Action example above.
						`;
                const agentOutput = await promptAgent(prompt);
                const { name, input } = await parseApiResponse(agentOutput);

                if (!name) {
                  vscode.window.showErrorMessage(
                    "Agent did not return a tool name",
                  );
                  return;
                }
                const functionToCallBaseOnAgentResponse: (
                  ...args: any
                ) => Promise<any> | undefined = agentFunctions[name];

                if (!functionToCallBaseOnAgentResponse) {
                  vscode.window.showErrorMessage(
                    "Agent returned an invalid tool name",
                  );
                  return;
                }

                await functionToCallBaseOnAgentResponse(...input);

                vscode.window.showInformationMessage(
                  "Successfully processed files",
                );
              } catch (error: any) {
                vscode.window.showErrorMessage(
                  "Error listing files: " + error.message,
                );
              }
            } else {
              vscode.window.showErrorMessage("No workspace found");
            }
          }
        });
    },
  });

  registerCommand({
    context,
    commandName: CommandName.createVectorDB,
    executable: async () => {
      vscode.window.showInformationMessage("Vectorizing Resources");
      try {
        await vectorizeResources();
      } catch (error) {
        console.error(error);
      }
      vscode.window.showInformationMessage(
        "Hello World from translation-test!",
      );
      vscode.window.showInformationMessage("Vectorization Complete");
    },
  });

  registerCommand({
    context,
    commandName: CommandName.initFiles,
    executable: async () => {
      vscode.window.showInformationMessage("Generating Files");
      await generatePythonEnv();
      await generateFilesInWorkspace();
      vscode.window.showInformationMessage("Done");
    },
  });

  registerCommand({
    context,
    commandName: CommandName.editFiles,
    executable: async () => {
      showDiffWithOriginal("/resources/lexicon.tsv");
    },
  });

  registerCommand({
    context,
    commandName: CommandName.askResources,
    executable: async () => {
      vscode.window
        .showInputBox({
          prompt: "What Kind of information are you looking for?",
          placeHolder: "Enter your instruction here",
        })
        .then(async (userQuery) => {
          if (userQuery) {
            await queryVectorizedResources(userQuery);
          } else {
            vscode.window.showInformationMessage(
              "Type something in the prompt silly :)",
            );
          }
        });
    },
  });

  registerCommand({
    context,
    commandName: CommandName.processSelection,
    executable: async (codeLensArgs: CodeLensArgs) => {
      // Process the selected text as required
      vscode.window.showInformationMessage(
        `Selected text: ${codeLensArgs.currentText}`,
      );

      editFile({
        fileUri: codeLensArgs.document.uri,
        positionRange: codeLensArgs.positionRange,
        newContent: "test content",
      });
    },
  });

  registerCommand({
    context,
    commandName: CommandName.openUsfmConverter,
    executable: async () => {
      const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: "Open",
      };

      vscode.window.showOpenDialog(options).then((folderUri) => {
        if (folderUri && folderUri[0]) {
          const conversionOptions = [
            "USFM to JSON",
            // "JSON to USFM",
            // "Export to CSV",
          ];
          vscode.window
            .showQuickPick(conversionOptions, {
              placeHolder: "Choose conversion option",
            })
            .then((selectedOption) => {
              // Handle the selected option
              if (selectedOption === "USFM to JSON") {
                try {
                  const fs = require("fs");
                  const path = require("path");
                  const directoryPath = folderUri[0].fsPath;
                  fs.readdir(
                    directoryPath,
                    async function (err: any, files: any) {
                      if (err) {
                        return console.error(
                          "Unable to scan directory: " + err,
                        );
                      }
                      for (const file of files) {
                        if (
                          path.extname(file) === ".SFM" ||
                          path.extname(file) === ".sfm"
                        ) {
                          fs.readFile(
                            path.join(directoryPath, file),
                            "utf8",
                            async function (err: any, contents: any) {
                              const myUsfmParser = new grammar.USFMParser(
                                contents,
                                grammar.LEVEL.RELAXED,
                              );

                              const fileName =
                                path.basename(file, path.extname(file)) +
                                ".json";
                              try {
                                const jsonOutput: JSON = myUsfmParser.toJSON();
                                await generateFiles({
                                  workspaceRelativeParentFolderFilepath:
                                    "importedProject",
                                  fileName,
                                  fileContent: JSON.stringify(jsonOutput),
                                  shouldOverWrite: true,
                                });
                              } catch (error) {
                                console.error(
                                  "Error generating files for " + fileName,
                                  error,
                                );
                              }
                            },
                          );
                        }
                      }
                    },
                  );
                } catch (error) {
                  console.error("Error in USFM to JSON conversion", error);
                }
              }
            });
        }
      });
    },
  });

  // Register the CodeLens provider
  const selectionCodeLensProvider = new SelectionCodeLensProvider();
  let providerDisposable = vscode.languages.registerCodeLensProvider(
    "*",
    selectionCodeLensProvider,
  );
  context.subscriptions.push(providerDisposable);

  // Set up the event listener for selection changes
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      // console.log({ event });
      if (event.textEditor === vscode.window.activeTextEditor) {
        // Refresh CodeLens
        selectionCodeLensProvider.onDidChangeCodeLensesEmitter.fire(
          event.textEditor.document,
        );
      }
    }),
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
