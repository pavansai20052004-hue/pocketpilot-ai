"""Evidence-backed ecosystem, framework, and project detection."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from pocketpilot_agent.models import (
    DetectedFramework,
    DetectedProject,
    DetectionConfidence,
    FileCategory,
    RepositoryFile,
)
from pocketpilot_agent.security import RepositorySecurityPolicy, SafePathResolver


class ProjectDetector:
    """Inspect only small, known manifests already approved by the scanner."""

    def __init__(
        self,
        resolver: SafePathResolver,
        files: tuple[RepositoryFile, ...],
        max_manifest_size: int,
        policy: RepositorySecurityPolicy | None = None,
    ) -> None:
        self.resolver = resolver
        self.files = files
        self.max_manifest_size = max_manifest_size
        self.policy = policy or RepositorySecurityPolicy()
        self._file_by_path = {item.relative_path: item for item in files}

    def detect(
        self,
    ) -> tuple[
        tuple[DetectedProject, ...],
        tuple[DetectedFramework, ...],
        tuple[str, ...],
        tuple[str, ...],
    ]:
        projects: list[DetectedProject] = []
        framework_evidence: dict[str, list[str]] = defaultdict(list)
        build_systems: set[str] = set()
        package_managers: set[str] = set()

        for repository_file in self.files:
            relative = repository_file.relative_path
            name = Path(relative).name.casefold()
            parent = Path(relative).parent.as_posix()
            project_root = "." if parent == "." else parent

            if name == "pom.xml":
                build_systems.add("Maven")
                content = self._read_manifest(relative)
                spring = content is not None and "spring-boot" in content.casefold()
                if spring:
                    framework_evidence["Spring Boot"].append(
                        f"spring-boot dependency/plugin in {relative}"
                    )
                projects.append(
                    DetectedProject(
                        project_type="JAVA_MAVEN_SPRING_BOOT" if spring else "JAVA_MAVEN",
                        relative_root=project_root,
                        evidence=[relative],
                    )
                )
            elif name in {"build.gradle", "build.gradle.kts"}:
                build_systems.add("Gradle")
                content = self._read_manifest(relative)
                spring = content is not None and "org.springframework.boot" in content.casefold()
                if spring:
                    framework_evidence["Spring Boot"].append(
                        f"Spring Boot Gradle plugin in {relative}"
                    )
                projects.append(
                    DetectedProject(
                        project_type="JAVA_GRADLE_SPRING_BOOT" if spring else "JAVA_GRADLE",
                        relative_root=project_root,
                        evidence=[relative],
                    )
                )
            elif name == "package.json":
                projects.extend(
                    self._detect_package_json(relative, project_root, framework_evidence)
                )
            elif name in {"pyproject.toml", "requirements.txt"}:
                build_systems.add("Python")
                package_managers.add("pip")
                content = self._read_manifest(relative)
                if content is not None and "pytest" in content.casefold():
                    build_systems.add("pytest")
                projects.extend(
                    self._detect_python(relative, project_root, framework_evidence)
                )
            elif name == "pytest.ini":
                build_systems.add("pytest")
            elif name == "pnpm-lock.yaml":
                package_managers.add("pnpm")
            elif name == "yarn.lock":
                package_managers.add("yarn")

        root_names = {Path(item.relative_path).name.casefold() for item in self.files}
        has_package_json = "package.json" in root_names
        if "package-lock.json" in root_names:
            package_managers.add("npm")
        if has_package_json and not package_managers.intersection({"npm", "pnpm", "yarn"}):
            package_managers.add("npm")
        build_systems.update(package_managers.intersection({"npm", "pnpm", "yarn"}))
        if any(Path(item.relative_path).name.casefold() == "pytest.ini" for item in self.files):
            build_systems.add("pytest")

        frameworks = tuple(
            DetectedFramework(
                name=name,
                confidence=DetectionConfidence.HIGH,
                evidence=sorted(set(evidence)),
            )
            for name, evidence in sorted(framework_evidence.items())
        )
        unique_projects = {
            (item.project_type, item.relative_root): item for item in projects
        }
        ordered_projects = sorted(
            unique_projects.values(), key=lambda item: (item.relative_root, item.project_type)
        )
        return (
            tuple(ordered_projects),
            frameworks,
            tuple(sorted(build_systems)),
            tuple(sorted(package_managers)),
        )

    def load_package_json(self, relative: str) -> dict[str, object] | None:
        content = self._read_manifest(relative)
        if content is None:
            return None
        try:
            payload = json.loads(content)
        except (json.JSONDecodeError, UnicodeError):
            return None
        return payload if isinstance(payload, dict) else None

    def _detect_package_json(
        self,
        relative: str,
        project_root: str,
        framework_evidence: dict[str, list[str]],
    ) -> list[DetectedProject]:
        payload = self.load_package_json(relative)
        if payload is None:
            return []
        dependencies: dict[str, object] = {}
        for key in ("dependencies", "devDependencies"):
            value = payload.get(key)
            if isinstance(value, dict):
                dependencies.update(value)
        names = {str(name).casefold() for name in dependencies}
        evidence = [relative]
        project_type = "NODE"
        if "next" in names:
            project_type = "NEXTJS"
            framework_evidence["Next.js"].append(f"next dependency in {relative}")
            framework_evidence["React"].append(f"Next.js/React dependency in {relative}")
        elif "expo" in names:
            project_type = "EXPO_REACT_NATIVE"
            framework_evidence["Expo"].append(f"expo dependency in {relative}")
            if "react" in names:
                framework_evidence["React"].append(f"react dependency in {relative}")
        elif "react" in names and "vite" in names:
            project_type = "REACT_VITE"
            framework_evidence["React"].append(f"react dependency in {relative}")
            framework_evidence["Vite"].append(f"vite dependency in {relative}")
        elif "react" in names:
            project_type = "REACT"
            framework_evidence["React"].append(f"react dependency in {relative}")
        elif "express" in names:
            project_type = "NODE_EXPRESS"
            framework_evidence["Express"].append(f"express dependency in {relative}")
        framework_evidence["Node.js"].append(f"package.json detected at {relative}")
        return [
            DetectedProject(
                project_type=project_type,
                relative_root=project_root,
                evidence=evidence,
            )
        ]

    def _detect_python(
        self,
        relative: str,
        project_root: str,
        framework_evidence: dict[str, list[str]],
    ) -> list[DetectedProject]:
        content = self._read_manifest(relative)
        if content is None:
            return []
        normalized = content.casefold()
        project_type = "PYTHON"
        if re.search(r"(^|[^a-z])fastapi([^a-z]|$)", normalized):
            project_type = "PYTHON_FASTAPI"
            framework_evidence["FastAPI"].append(f"fastapi dependency in {relative}")
        elif re.search(r"(^|[^a-z])flask([^a-z]|$)", normalized):
            project_type = "PYTHON_FLASK"
            framework_evidence["Flask"].append(f"flask dependency in {relative}")
        return [
            DetectedProject(
                project_type=project_type,
                relative_root=project_root,
                evidence=[relative],
            )
        ]

    def _read_manifest(self, relative: str) -> str | None:
        metadata = self._file_by_path.get(relative)
        if metadata is None:
            return None
        if metadata.category in {FileCategory.EXCLUDED_SENSITIVE, FileCategory.GENERATED}:
            return None
        if metadata.size_bytes > self.max_manifest_size:
            return None
        path = self.resolver.resolve_relative(relative)
        if self.policy.is_sensitive_file(path.name):
            return None
        try:
            return path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
