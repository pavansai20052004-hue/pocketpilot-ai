"""Deterministic local repository fixtures for agent tests."""

import json
from pathlib import Path

import pytest


@pytest.fixture
def python_project(tmp_path: Path) -> Path:
    root = tmp_path / "python-app"
    (root / "src").mkdir(parents=True)
    (root / "tests").mkdir()
    (root / "pyproject.toml").write_text(
        """[project]
name = "fixture"
version = "0.1.0"
dependencies = ["fastapi>=0.100"]

[project.optional-dependencies]
dev = ["pytest>=8"]
""",
        encoding="utf-8",
    )
    (root / "src" / "main.py").write_text("from fastapi import FastAPI\n", encoding="utf-8")
    (root / "tests" / "test_ok.py").write_text(
        "def test_ok() -> None:\n    assert 2 + 2 == 4\n",
        encoding="utf-8",
    )
    (root / ".env").write_text("DEMO_SECRET=never-read\n", encoding="utf-8")
    (root / "private.key").write_text("not-a-real-key\n", encoding="utf-8")
    (root / "node_modules").mkdir()
    (root / "node_modules" / "ignored.js").write_text("ignored", encoding="utf-8")
    return root


@pytest.fixture
def java_project(tmp_path: Path) -> Path:
    root = tmp_path / "java-app"
    source = root / "src" / "main" / "java" / "demo"
    source.mkdir(parents=True)
    (root / "pom.xml").write_text(
        """<project>
  <parent><artifactId>spring-boot-starter-parent</artifactId></parent>
  <dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies>
</project>
""",
        encoding="utf-8",
    )
    (source / "Application.java").write_text("class Application {}\n", encoding="utf-8")
    (source / "UserService.java").write_text(
        """package demo;

class UserService {
    private final UserRepository repository;

    UserService(UserRepository repository) {
        this.repository = repository;
    }

    String displayName(long id) {
        User user = repository.findById(id);
        return user.getName();
    }
}
""",
        encoding="utf-8",
    )
    return root


@pytest.fixture
def react_project(tmp_path: Path) -> Path:
    root = tmp_path / "react-app"
    (root / "src").mkdir(parents=True)
    package_json = {
        "name": "fixture-react-app",
        "private": True,
        "scripts": {
            "test": "vitest run",
            "build": "vite build",
            "typecheck": "tsc --noEmit",
            "deploy": "dangerous-deploy",
            "postinstall": "dangerous-postinstall",
        },
        "dependencies": {"react": "19.0.0"},
        "devDependencies": {"vite": "7.0.0"},
    }
    (root / "package.json").write_text(json.dumps(package_json), encoding="utf-8")
    (root / "package-lock.json").write_text("{}", encoding="utf-8")
    (root / "vite.config.ts").write_text("export default {}\n", encoding="utf-8")
    (root / "src" / "App.tsx").write_text("export const App = () => null;\n", encoding="utf-8")
    return root
