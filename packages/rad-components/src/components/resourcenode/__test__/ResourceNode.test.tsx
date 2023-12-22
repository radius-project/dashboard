import React from "react";
import { describe, expect, it } from "vitest";
import '@testing-library/jest-dom';
import { render, screen } from "@testing-library/react";
import ResourceNode from "../ResourceNode";
import * as sampledata from "../../../sampledata";

describe("ResourceNode component", () => {
  it("ResourceNode should render correctly", () => {
    const resource = sampledata.ContainerResource;
    render(<ResourceNode resource={resource} />);
    const name = screen.getByRole("heading", { name: resource.name});
    expect(name).toBeInTheDocument();
    const type = screen.getByRole("heading", { name: resource.type});
    expect(type).toBeInTheDocument();
  });
});