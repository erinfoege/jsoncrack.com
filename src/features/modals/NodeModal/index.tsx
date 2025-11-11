import React, { useEffect, useState } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";
import useJson from "../../../store/useJson";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const [editValue, setEditValue] = useState<string>(normalizeNodeData(nodeData?.text ?? []));
  const [displayContent, setDisplayContent] = useState<string>(normalizeNodeData(nodeData?.text ?? []));
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  useEffect(() => {
    const normalized = normalizeNodeData(nodeData?.text ?? []);
    setDisplayContent(normalized);
    setEditValue(normalized);
    setError(null);
    setIsEditing(false);
  }, [nodeData?.id, nodeData?.text]);

  // helper to set a value at a JSON path (array of string|number)
  const setValueAtPath = (obj: any, path: Array<string | number> | undefined, value: any) => {
    if (!path || path.length === 0) return value; // replace root

    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      if (typeof seg === "number") {
        if (!Array.isArray(cur)) return false;
        cur = cur[seg];
      } else {
        if (cur[seg] === undefined) cur[seg] = {};
        cur = cur[seg];
      }
      if (cur === undefined) return false;
    }

    const last = path[path.length - 1];
    if (typeof last === "number") {
      if (!Array.isArray(cur)) return false;
      cur[last] = value;
    } else {
      cur[last] = value;
    }

    return true;
  };

  const handleSave = () => {
    setError(null);
    try {
      // parse the user edits
      const parsed = JSON.parse(editValue);

      // current json object
      const rootJson = JSON.parse(useJson.getState().getJson());

      if (!nodeData?.path || nodeData.path.length === 0) {
        // replace full JSON
        useFile.getState().setContents({ contents: JSON.stringify(parsed, null, 2) });
      } else {
        // set parsed value at the specific path
        const success = setValueAtPath(rootJson, nodeData.path as Array<string | number>, parsed);
        if (!success) throw new Error("Failed to update value at path");
        useFile.getState().setContents({ contents: JSON.stringify(rootJson, null, 2) });
      }

      // stop editing but keep modal open so user sees the updated value
      setIsEditing(false);

      // Update display content by directly parsing the new edited value
      // This ensures the display updates with what the user just entered
      try {
        const newDisplayContent = JSON.stringify(parsed, null, 2);
        setDisplayContent(newDisplayContent);
      } catch (e) {
        // fallback: use normalized version if parsing fails
        setDisplayContent(normalizeNodeData(nodeData?.text ?? []));
      }
    } catch (err: any) {
      setError(err?.message ?? "Invalid JSON");
    }
  };

  const handleCancel = () => {
    // reset local edits and stop editing (don't close modal)
    setEditValue(normalizeNodeData(nodeData?.text ?? []));
    setError(null);
    setIsEditing(false);
  };

  const handleClose = () => {
    // if currently editing, discard edits; then close modal
    if (isEditing) {
      handleCancel();
    }
    onClose?.();
  };

  return (
    <Modal size="auto" opened={opened} onClose={handleClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        {/* Node Content Section */}
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Node Content
            </Text>
            <CloseButton onClick={handleClose} />
          </Flex>
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex align="center" gap="xs">
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} size="xs">
                  Edit
                </Button>
              ) : (
                <>
                  <Button variant="default" onClick={handleCancel} size="xs">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} size="xs">
                    Save
                  </Button>
                </>
              )}
            </Flex>
          </Flex>
          {!isEditing ? (
            <ScrollArea.Autosize mah={250} maw={600}>
              {/* read-only view */}
              <CodeHighlight
                code={displayContent}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            </ScrollArea.Autosize>
          ) : (
            // editable textarea without inner scrollbar; autosize to content lines
            <div style={{ minWidth: 350, maxWidth: 600 }}>
              <Textarea
                autosize
                minRows={Math.max(3, (displayContent || "").split("\n").length)}
                maxRows={20}
                value={editValue}
                onChange={e => setEditValue(e.currentTarget.value)}
                style={{ fontFamily: "monospace", whiteSpace: "pre" }}
                placeholder="Enter JSON to edit..."
              />
            </div>
          )}
          {error && (
            <Text color="red" fz="xs">
              {error}
            </Text>
          )}
          <Text fz="xs" fw={500}>
            JSON Path
          </Text>
          <ScrollArea.Autosize maw={600}>
            <CodeHighlight
              code={jsonPathToString(nodeData?.path)}
              miw={350}
              mah={250}
              language="json"
              copyLabel="Copy to clipboard"
              copiedLabel="Copied to clipboard"
              withCopyButton
            />
          </ScrollArea.Autosize>
        </Stack>
      </Stack>
    </Modal>
  );
};
