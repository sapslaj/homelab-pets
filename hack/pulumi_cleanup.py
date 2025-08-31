#!/usr/bin/env python3

import json
import subprocess
import sys
from typing import List


class Colors:
    RED = "\033[0;31m"
    GREEN = "\033[0;32m"
    YELLOW = "\033[1;33m"
    NC = "\033[0m"


def print_status(msg: str):
    print(f"{Colors.GREEN}[INFO]{Colors.NC} {msg}")


def print_warning(msg: str):
    print(f"{Colors.YELLOW}[WARN]{Colors.NC} {msg}")


def print_error(msg: str):
    print(f"{Colors.RED}[ERROR]{Colors.NC} {msg}")


def get_pending_deletion_resources() -> List[dict]:
    """Get list of resources marked for deletion from Pulumi state with their IDs."""
    try:
        # Export pulumi state
        result = subprocess.run(
            ["pulumi", "stack", "export"], capture_output=True, text=True, check=True
        )

        # Parse JSON and filter
        state_data = json.loads(result.stdout)
        resources = []

        for resource in state_data.get("deployment", {}).get("resources", []):
            if resource.get("delete") is True:
                urn = resource.get("urn", "")
                resource_id = resource.get("id", "")
                # Skip provider resources
                if "pulumi:providers:mid" not in urn:
                    resources.append({"urn": urn, "id": resource_id})

        return resources

    except subprocess.CalledProcessError as e:
        print_error(f"Failed to export Pulumi state: {e}")
        return []
    except json.JSONDecodeError as e:
        print_error(f"Failed to parse Pulumi state JSON: {e}")
        return []


def remove_pending_deletion_resources_from_state() -> tuple[int, int]:
    """Remove all pending deletion resources by directly manipulating the state.

    Returns:
        tuple: (success_count, failure_count)
    """
    try:
        print_status("Removing pending deletion resources by state manipulation")

        # Export current state
        result = subprocess.run(
            ["pulumi", "stack", "export"], capture_output=True, text=True, check=True
        )

        state_data = json.loads(result.stdout)

        # Remove all resources marked for deletion
        original_count = len(state_data.get("deployment", {}).get("resources", []))
        state_data["deployment"]["resources"] = [
            resource
            for resource in state_data.get("deployment", {}).get("resources", [])
            if not resource.get("delete", False)
        ]
        new_count = len(state_data.get("deployment", {}).get("resources", []))

        removed_count = original_count - new_count
        print_status(
            f"Found {removed_count} pending deletion resources to remove from state"
        )

        if removed_count > 0:
            # Write the modified state to a temp file
            import tempfile
            import os

            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False
            ) as f:
                json.dump(state_data, f, indent=2)
                temp_file = f.name

            # Import the modified state
            result = subprocess.run(
                ["pulumi", "stack", "import", "--file", temp_file],
                capture_output=True,
                text=True,
                timeout=60,
            )

            # Clean up temp file
            os.unlink(temp_file)

            if result.returncode == 0:
                print_status(
                    f"Successfully removed {removed_count} pending deletion resources"
                )
                return removed_count, 0
            else:
                print_error(f"Failed to import modified state: {result.stderr}")
                return 0, removed_count
        else:
            print_status("No pending deletion resources found to remove")
            return 0, 0

    except subprocess.CalledProcessError as e:
        print_error(f"Failed to export Pulumi state: {e}")
        return 0, 0
    except json.JSONDecodeError as e:
        print_error(f"Failed to parse Pulumi state JSON: {e}")
        return 0, 0
    except Exception as e:
        print_error(f"Error during state manipulation: {e}")
        return 0, 0


def main():
    """Main function to process all pending deletion resources."""
    print_status("Starting Pulumi pending deletion cleanup...")

    # Get pending deletion resources first to check what we have
    resources = get_pending_deletion_resources()

    if not resources:
        print_status("No pending deletion resources found")
        return

    print_status(f"Found {len(resources)} pending deletion resource(s)")

    # Remove the pending deletion resources by manipulating the state
    success_count, failure_count = remove_pending_deletion_resources_from_state()

    # Print summary
    print("=" * 40)
    print_status("Cleanup completed!")
    print_status(f"Successfully deleted: {success_count} resource(s)")

    if failure_count > 0:
        print_warning(f"Failed to delete: {failure_count} resource(s)")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in ["--help", "-h"]:
        print("Usage: python3 pulumi_cleanup.py")
        print("")
        print(
            "This script automatically removes all pending deletion resources from the current Pulumi stack state."
        )
        print("")
        print("Requirements:")
        print("  - pulumi CLI")
        print("")
        sys.exit(0)

    main()
