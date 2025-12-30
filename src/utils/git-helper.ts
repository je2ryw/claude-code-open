/**
 * Git Helper Utilities
 *
 * Provides utilities for git operations, including commit message
 * attribution handling.
 */

import { getCommitAttribution } from './attribution.js';

/**
 * Add attribution to a git commit message if not already present
 *
 * This function appends the attribution trailer to the commit message
 * in the standard Git trailer format, following Git conventions.
 *
 * @param commitMessage - Original commit message
 * @param modelId - Optional model ID for attribution
 * @returns Commit message with attribution appended (or original if disabled)
 */
export function addCommitAttribution(commitMessage: string, modelId?: string): string {
  // Get attribution text from config
  const attribution = getCommitAttribution(modelId);

  // If attribution is disabled (empty string), return original message
  if (!attribution || attribution.trim() === '') {
    return commitMessage;
  }

  // Check if attribution is already present in the message
  // This prevents duplicate attribution if the user manually added it
  if (commitMessage.includes('Co-Authored-By: Claude') ||
      commitMessage.includes('noreply@anthropic.com')) {
    return commitMessage;
  }

  // Ensure there's a blank line before trailers (Git convention)
  let message = commitMessage.trim();

  // Check if message already has trailers (lines starting with a trailer keyword)
  const trailerPattern = /\n\n[\w-]+:/;
  const hasTrailers = trailerPattern.test(message);

  if (hasTrailers) {
    // If trailers exist, append our trailer to them
    return `${message}\n${attribution}`;
  } else {
    // If no trailers, add a blank line before the trailer
    return `${message}\n\n${attribution}`;
  }
}

/**
 * Detect if a shell command is a git commit command
 *
 * @param command - Shell command string
 * @returns true if it's a git commit command
 */
export function isGitCommitCommand(command: string): boolean {
  // Match various git commit patterns:
  // - git commit
  // - git commit -m "..."
  // - git commit --message "..."
  // - git commit -am "..."
  // etc.

  // Remove leading/trailing whitespace
  const cmd = command.trim();

  // Check if it starts with git commit
  if (!cmd.match(/^git\s+commit\b/)) {
    return false;
  }

  // Exclude git commit --amend without message (opens editor)
  // Exclude git commit without -m (opens editor)
  // We only want to process commands with -m or --message

  // Check for -m or --message flag
  return /\s+(-m|--message)\s+/.test(cmd);
}

/**
 * Process a git commit command to add attribution
 *
 * This function modifies git commit commands to include attribution
 * in the commit message.
 *
 * @param command - Original git commit command
 * @param modelId - Optional model ID for attribution
 * @returns Modified command with attribution, or original if not applicable
 */
export function processGitCommitCommand(command: string, modelId?: string): string {
  if (!isGitCommitCommand(command)) {
    return command;
  }

  // Extract the commit message from the command
  // Handle both -m "message" and -m "$(cat <<'EOF' ...)"

  // Pattern 1: -m "message" (simple quoted string)
  const simplePattern = /(-m|--message)\s+["']([^"']+)["']/;
  const simpleMatch = command.match(simplePattern);

  if (simpleMatch) {
    const originalMessage = simpleMatch[2];
    const newMessage = addCommitAttribution(originalMessage, modelId);

    // Replace the message in the command
    return command.replace(simplePattern, `$1 "${newMessage}"`);
  }

  // Pattern 2: -m "$(cat <<'EOF' ... EOF)" (heredoc)
  const heredocPattern = /(-m|--message)\s+"?\$\(cat\s+<<'?EOF'?\s+([\s\S]*?)\s+EOF\s*\)"?/;
  const heredocMatch = command.match(heredocPattern);

  if (heredocMatch) {
    const originalMessage = heredocMatch[2].trim();
    const newMessage = addCommitAttribution(originalMessage, modelId);

    // Replace the message in the heredoc
    return command.replace(
      heredocPattern,
      `$1 "$(cat <<'EOF'\n${newMessage}\nEOF\n)"`
    );
  }

  // If we can't parse the message format, return original command
  return command;
}

/**
 * Check if a git commit command already has attribution
 *
 * @param command - Git commit command
 * @returns true if attribution is already present
 */
export function hasCommitAttribution(command: string): boolean {
  return command.includes('Co-Authored-By: Claude') ||
         command.includes('noreply@anthropic.com');
}
