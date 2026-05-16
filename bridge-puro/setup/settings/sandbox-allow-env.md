```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
    "CLAUDE_CODE_DISABLE_FAST_MODE": "1",
    "MAX_THINKING_TOKENS": "32000",
    "IS_DEMO": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
    "CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY": "1",
    "CLAUDE_CODE_SUBPROCESS_ENV_SCRUB": "1",
    "CLAUDE_CODE_SUBAGENT_MODEL": "claude-sonnet-4-6"
  },
  "permissions": {
    "allow": [
      "Read(*)",
      "Edit(*)",
      "Write(*)",
      "Bash(*)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(git reset *)",
      "Bash(rm -rf *)"
    ]
  },
  "model": "opus[1m]",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/Users/2a/.claude/hooks/puro-check-update.js\""
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash /Users/2a/.claude/hooks/puro-session-state.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash|Edit|Write|MultiEdit|Agent|Task",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/Users/2a/.claude/hooks/puro-context-monitor.js\"",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash /Users/2a/.claude/hooks/puro-phase-boundary.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/Users/2a/.claude/hooks/puro-prompt-guard.js\"",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/Users/2a/.claude/hooks/puro-read-guard.js\"",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/Users/2a/.claude/hooks/puro-workflow-guard.js\"",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash /Users/2a/.claude/hooks/puro-validate-commit.sh",
            "timeout": 5
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "bash /Users/2a/.claude/statusline.sh"
  },
  "enabledPlugins": {
    "puro-pt-br@local": true
  },
  "extraKnownMarketplaces": {
    "local": {
      "source": {
        "source": "settings",
        "name": "local",
        "plugins": [
          {
            "name": "puro-pt-br",
            "source": {
              "source": "github",
              "repo": "AgentesIntegrados/puro-pt-br-v2"
            }
          }
        ]
      }
    }
  },
  "outputStyle": "Concise",
  "language": "portuguese",
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "filesystem": {
      "read": {
        "allowWithinDeny": [
          "/Users/2a/.claude/openclaw-mythos-puro/backend-sdk-claude/.env"
        ]
      }
    },
    "network": {
      "allowedDomains": [
        "github.com",
        "*.npmjs.org",
        "registry.npmjs.org",
        "api.anthropic.com"
      ],
      "allowLocalBinding": true
    },
    "excludedCommands": [
      "git",
      "docker"
    ]
  },
  "alwaysThinkingEnabled": true,
  "autoCompactWindow": 400000,
  "tui": "fullscreen",
  "voice": {
    "enabled": true,
    "mode": "hold"
  },
  "showThinkingSummaries": true,
  "skipDangerousModePermissionPrompt": true,
  "skipAutoPermissionPrompt": true,
  "voiceEnabled": true,
  "editorMode": "vim"
}
```
