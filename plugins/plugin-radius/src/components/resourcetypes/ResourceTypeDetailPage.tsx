import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Content,
  Header,
  Page,
  Progress,
  ResponseErrorPanel,
  TabbedLayout,
  MarkdownContent,
  Breadcrumbs,
  Link,
  InfoCard,
} from '@backstage/core-components';
import { Grid, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, makeStyles, IconButton, Tooltip, Box } from '@material-ui/core';
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { radiusApiRef } from '../../plugin';

const useStyles = makeStyles(() => ({
  tableCell: {
    padding: '16px !important',
    verticalAlign: 'top !important',
  },
  markdownDescription: {
    margin: '0 !important',
    padding: '0 !important',
    '& > *': {
      margin: '0 !important',
      padding: '0 !important',
    },
    '& p': {
      margin: '0 !important',
      padding: '0 !important',
      lineHeight: '1.4 !important',
    },
    '& ul, & ol': {
      margin: '0 !important',
      paddingLeft: '16px !important',
    },
    '& li': {
      margin: '0 !important',
    },
    '& code': {
      backgroundColor: '#f6f8fa !important',
      padding: '2px 4px !important',
      borderRadius: '3px !important',
      fontSize: '85% !important',
    },
    '& pre': {
      margin: '0 !important',
      padding: '8px !important',
      backgroundColor: '#f6f8fa !important',
      borderRadius: '6px !important',
      overflow: 'auto !important',
    },
  },
  markdownContainer: {
    // Target all possible copy button selectors in CodeSnippet
    '& button[title*="Copy"], & button[aria-label*="Copy"], & button[aria-label*="copy"]': {
      position: 'absolute !important',
      top: '8px !important',
      right: '8px !important',
      width: '32px !important',
      height: '32px !important',
      padding: '0 !important',
      margin: '0 !important',
      backgroundColor: 'rgba(246, 248, 250, 0.95) !important',
      border: '1px solid rgba(31, 35, 40, 0.15) !important',
      borderRadius: '6px !important',
      cursor: 'pointer !important',
      display: 'flex !important',
      alignItems: 'center !important',
      justifyContent: 'center !important',
      opacity: '0.7 !important',
      transition: 'all 0.2s ease !important',
      zIndex: 1000,
      minWidth: '32px !important',
      minHeight: '32px !important',
      // Hide existing icon/text
      '& svg, & span, & *': {
        display: 'none !important',
      },
      // Add GitHub clipboard icon
      '&::after': {
        content: '""',
        display: 'block !important',
        width: '16px',
        height: '16px',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23656d76'%3E%3Cpath d='M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z'/%3E%3Cpath d='M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: '16px 16px',
      },
      '&:hover': {
        opacity: '1 !important',
        backgroundColor: 'rgba(208, 215, 222, 0.32) !important',
      },
      '&:active': {
        backgroundColor: 'rgba(31, 35, 40, 0.12) !important',
      },
    },
  },
  // Additional styles for code snippet container
  codeSnippetContainer: {
    position: 'relative',
    '& > div': {
      position: 'relative',
    },
    // More specific targeting for Backstage CodeSnippet
    '& .MuiIconButton-root, & button': {
      position: 'absolute !important',
      top: '8px !important',
      right: '8px !important',
      width: '32px !important',
      height: '32px !important',
      padding: '0 !important',
      backgroundColor: 'rgba(246, 248, 250, 0.95) !important',
      border: '1px solid rgba(31, 35, 40, 0.15) !important',
      borderRadius: '6px !important',
      '& svg': {
        display: 'none !important',
      },
      '&::after': {
        content: '""',
        display: 'block !important',
        width: '16px',
        height: '16px',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23656d76'%3E%3Cpath d='M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z'/%3E%3Cpath d='M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: '16px 16px',
      },
      '&:hover': {
        backgroundColor: 'rgba(208, 215, 222, 0.32) !important',
      },
    },
  },
}));

// Custom GitHub-style copy button component
const GitHubCopyButton = ({ text, className }: { text: string; className?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Failed to copy - silently handle error
    }
  };

  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
      <IconButton
        onClick={handleCopy}
        className={className}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '32px',
          height: '32px',
          padding: '0',
          backgroundColor: 'rgba(246, 248, 250, 0.95)',
          border: '1px solid rgba(31, 35, 40, 0.15)',
          borderRadius: '6px',
          opacity: copied ? 1 : 0.7,
          transition: 'all 0.2s ease',
          zIndex: 1000,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.backgroundColor = 'rgba(208, 215, 222, 0.32)';
        }}
        onMouseLeave={(e) => {
          if (!copied) {
            e.currentTarget.style.opacity = '0.7';
            e.currentTarget.style.backgroundColor = 'rgba(246, 248, 250, 0.95)';
          }
        }}
      >
        <div
          style={{
            width: '16px',
            height: '16px',
            backgroundImage: copied 
              ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%2300a56b'%3E%3Cpath d='M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z'/%3E%3C/svg%3E")`
              : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23656d76'%3E%3Cpath d='M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z'/%3E%3Cpath d='M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: '16px 16px',
          }}
        />
      </IconButton>
    </Tooltip>
  );
};

export const ResourceTypeDetailPage = () => {
  const classes = useStyles();
  const { namespace, typeName } = useParams<{ namespace: string; typeName: string }>();
  const radiusApi = useApi(radiusApiRef);

  const { value: resourceType, loading, error } = useAsync(async () => {
    if (!namespace || !typeName) return undefined;
    return await radiusApi.getResourceType({ namespace, typeName });
  }, [namespace, typeName]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;
  if (!resourceType) return <ResponseErrorPanel error={new Error('Resource type not found')} />;

  const formatDescription = (description: string) => {
    // Convert escaped newlines to actual newlines for proper Markdown parsing
    // Remove unwanted strings and trim extra spaces
    return description
      .replace(/\\n/g, '\n')
      .replace(/\(Required\)\s*/g, '')
      .replace(/\(Optional\)\s*/g, '')
      .replace(/\(Read-only\)\s*/g, '')
      .replace(/\(Read-Only\)\s*/g, '')
      .replace(/^\s+/, ''); // Remove leading spaces
  };



  // Parse markdown and render code blocks as CodeSnippet components
  const renderMarkdownWithCodeSnippets = (content: string) => {
    const parts = [];
    let currentIndex = 0;
    let keyCounter = 0;

    // Regex to find code blocks with language specifiers
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match = codeBlockRegex.exec(content);

    while (match !== null) {
      // Add any text before the code block
      if (match.index > currentIndex) {
        const textBefore = content.substring(currentIndex, match.index);
        if (textBefore.trim()) {
          parts.push(
            <MarkdownContent key={`text-${keyCounter++}`} content={textBefore} />
          );
        }
      }

      // Add the code block with custom styling
      const code = match[2].trim();
      parts.push(
        <div key={`code-${keyCounter++}`} style={{ position: 'relative', margin: '16px 0' }}>
          <pre style={{
            backgroundColor: '#f6f8fa',
            border: '1px solid #d0d7de',
            borderRadius: '6px',
            padding: '16px',
            overflow: 'auto',
            fontSize: '12px',
            lineHeight: 1.45,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
          }}>
            <code>{code}</code>
          </pre>
          <GitHubCopyButton text={code} />
        </div>
      );

      currentIndex = match.index + match[0].length;
      match = codeBlockRegex.exec(content);
    }

    // Add any remaining text after the last code block
    if (currentIndex < content.length) {
      const remainingText = content.substring(currentIndex);
      if (remainingText.trim()) {
        parts.push(
          <MarkdownContent key={`text-${keyCounter++}`} content={remainingText} />
        );
      }
    }

    // If no code blocks were found, just render as normal markdown
    if (parts.length === 0) {
      parts.push(<MarkdownContent key="full-content" content={content} />);
    }

    return parts;
  };

  // Test markdown content with code blocks to verify copy button functionality
  const testMarkdownContent = `# Resource Type Description

This resource type defines containers that can be deployed in a Radius application.

## Example Configuration

Here's how to configure a container resource:

\`\`\`yaml
apiVersion: radapp.io/v1alpha3
kind: Container
metadata:
  name: webapp
spec:
  image: nginx:latest
  ports:
    - containerPort: 80
  environment:
    - name: ENV_VAR
      value: "example"
\`\`\`

## Another Code Example

\`\`\`json
{
  "type": "Applications.Core/containers",
  "name": "webapp",
  "properties": {
    "image": "nginx:latest"
  }
}
\`\`\`

This should test whether copy buttons appear properly.`;

  return (
    <Page themeId="tool">
      <Header 
        title={resourceType.Name}
        subtitle={`Resource Type in ${resourceType.ResourceProviderNamespace}`}
      />
      <Content>
        <Box mb={3}>
          <Breadcrumbs aria-label="breadcrumb">
            <Link to="/">Home</Link>
            <Link to="/resource-types">Resource Types</Link>
            <Typography>{typeName}</Typography>
          </Breadcrumbs>
        </Box>
        <TabbedLayout>
          <TabbedLayout.Route path="/overview" title="Overview">
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <div className={classes.markdownContainer}>
                  {renderMarkdownWithCodeSnippets(
                    resourceType.Description ? 
                      formatDescription(resourceType.Description) : 
                      testMarkdownContent
                  )}
                </div>
              </Grid>
            </Grid>
          </TabbedLayout.Route>
          
          <TabbedLayout.Route path="/properties" title="Properties">
            <Grid container spacing={3}>
              <Grid item xs={12}>
                {/* API Version Navigation */}
                {Object.keys(resourceType.APIVersions || {}).length > 1 && (
                  <Paper style={{ 
                    padding: '16px', 
                    marginBottom: '32px', 
                    backgroundColor: '#f8f9fa', 
                    border: '1px solid #d0d7de' 
                  }}>
                    <Typography variant="subtitle2" style={{ 
                      marginBottom: '12px', 
                      fontWeight: 'bold',
                      color: '#24292f'
                    }}>
                      API Versions
                    </Typography>
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '8px',
                      alignItems: 'center'
                    }}>
                      {Object.keys(resourceType.APIVersions || {})
                        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
                        .map((version) => (
                          <a
                            key={version}
                            href={`#version-${version}`}
                            style={{
                              display: 'inline-block',
                              padding: '6px 12px',
                              fontSize: '13px',
                              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                              backgroundColor: '#fff',
                              border: '1px solid #d0d7de',
                              borderRadius: '6px',
                              color: '#0969da',
                              textDecoration: 'none',
                              transition: 'all 0.15s ease-in-out',
                              fontWeight: '500'
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              const element = document.getElementById(`version-${version}`);
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f1f8ff';
                              e.currentTarget.style.borderColor = '#0969da';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 3px 6px rgba(0,0,0,0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#fff';
                              e.currentTarget.style.borderColor = '#d0d7de';
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            {version}
                          </a>
                        ))}
                    </div>
                  </Paper>
                )}

                {Object.entries(resourceType.APIVersions || {})
                  .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
                  .map(([version, versionData]) => {
                  const typedVersionData = versionData as { 
                    schema?: {
                      properties?: Record<string, {
                        type?: string;
                        description?: string;
                        readOnly?: boolean;
                        required?: string[];
                        properties?: Record<string, unknown>;
                      }>;
                      required?: string[];
                    };
                    // Also support uppercase Schema for compatibility
                    Schema?: {
                      properties?: Record<string, {
                        type?: string;
                        description?: string;
                        readOnly?: boolean;
                        required?: string[];
                        properties?: Record<string, unknown>;
                      }>;
                      required?: string[];
                    };
                  };





                  // Extract schema info for debugging
                  // Try both lowercase 'schema' and uppercase 'Schema'
                  let schemaInfo: { properties?: Record<string, unknown>; required?: string[] } | null = null;
                  
                  if (typedVersionData.schema?.properties) {
                    schemaInfo = {
                      properties: typedVersionData.schema.properties as Record<string, unknown>,
                      required: typedVersionData.schema.required as string[] || []
                    };
                  } else if (typedVersionData.Schema?.properties) {
                    schemaInfo = {
                      properties: typedVersionData.Schema.properties as Record<string, unknown>,
                      required: typedVersionData.Schema.required as string[] || []
                    };
                  } else if (typedVersionData.schema || typedVersionData.Schema) {
                    const findProperties = (obj: unknown): { properties?: Record<string, unknown>; required?: string[] } | null => {
                      if (!obj || typeof obj !== 'object') return null;
                      
                      const typed = obj as Record<string, unknown>;
                      
                      // Direct properties
                      if (typed.properties) {
                        return { properties: typed.properties as Record<string, unknown>, required: typed.required as string[] };
                      }
                      
                      // Check nested Schema
                      if (typed.Schema && typeof typed.Schema === 'object') {
                        const nested = findProperties(typed.Schema);
                        if (nested) return nested;
                      }
                      
                      // Check definitions
                      if (typed.definitions && typeof typed.definitions === 'object') {
                        const definitions = typed.definitions as Record<string, unknown>;
                        for (const defSchema of Object.values(definitions)) {
                          const nested = findProperties(defSchema);
                          if (nested) return nested;
                        }
                      }
                      
                      // Check resource/resourceType
                      if (typed.resource) {
                        const nested = findProperties(typed.resource);
                        if (nested) return nested;
                      }
                      
                      if (typed.resourceType) {
                        const nested = findProperties(typed.resourceType);
                        if (nested) return nested;
                      }
                      
                      return null;
                    };
                    schemaInfo = findProperties(typedVersionData.Schema);
                  }

                  // Extract schema info for property filtering
                  let propertiesSchemaInfo: { properties: Record<string, unknown>; required: string[] } | null = null;
                  
                  if (schemaInfo?.properties) {
                    propertiesSchemaInfo = {
                      properties: schemaInfo.properties,
                      required: schemaInfo.required || []
                    };
                  } else if (typedVersionData.schema?.properties) {
                    propertiesSchemaInfo = {
                      properties: typedVersionData.schema.properties as Record<string, unknown>,
                      required: typedVersionData.schema.required || []
                    };
                  } else if (typedVersionData.Schema?.properties) {
                    propertiesSchemaInfo = {
                      properties: typedVersionData.Schema.properties as Record<string, unknown>,
                      required: typedVersionData.Schema.required || []
                    };
                  }
                  
                  const properties = propertiesSchemaInfo?.properties ? 
                    Object.entries(propertiesSchemaInfo.properties)
                      .filter(([, propSchema]: [string, unknown]) => {
                        const typedProp = propSchema as { readOnly?: boolean };
                        const isReadOnly = typedProp.readOnly === true;
                        // Filter out properties that are explicitly marked as readOnly: true
                        return !isReadOnly;
                      })
                      .map(([propName, propSchema]: [string, unknown]) => {
                          const typedProp = propSchema as {
                            type?: string;
                            description?: string;
                            '$ref'?: string;
                            items?: {
                              type?: string;
                              '$ref'?: string;
                            };
                            additionalProperties?: {
                              type?: string;
                              properties?: Record<string, unknown>;
                              required?: string[];
                            };
                          };                        // Handle type references and arrays
                        let propType = typedProp.type || 'object';
                        if (typedProp.$ref) {
                          // Extract type from $ref like "#/definitions/SomeType"
                          const refMatch = typedProp.$ref.match(/[^/]+$/);
                          if (refMatch) {
                            propType = refMatch[0];
                          }
                        } else if (typedProp.type === 'array') {
                          // Handle array types with item types
                          const items = typedProp.items;
                          if (items?.type) {
                            propType = `${items.type}[]`;
                          } else if (items?.$ref) {
                            const refMatch = items.$ref.match(/[^/]+$/);
                            if (refMatch) {
                              propType = `${refMatch[0]}[]`;
                            }
                          } else {
                            propType = 'array';
                          }
                        } else if (typedProp.additionalProperties) {
                          // Objects with additionalProperties are maps
                          propType = 'map';
                        }
                        
                        const actualRequiredFields = propertiesSchemaInfo?.required || [];
                        
                        return {
                          name: propName,
                          type: propType,
                          required: actualRequiredFields.includes(propName),
                          description: formatDescription(typedProp.description || ''),
                          schema: propSchema, // Keep the original schema for nested extraction
                        };
                      })
                    : [];

                  // Function to extract nested properties from object type properties
                  const extractNestedProperties = (propertySchema: unknown): {
                    properties: Array<{name: string; type: string; required: boolean; description: string; schema: unknown}>;
                    required: string[];
                  } | null => {
                    const schema = propertySchema as {
                      type?: string;
                      properties?: Record<string, unknown>;
                      required?: string[];
                      items?: {
                        type?: string;
                        properties?: Record<string, unknown>;
                        required?: string[];
                      };
                      additionalProperties?: {
                        type?: string;
                        properties?: Record<string, unknown>;
                        required?: string[];
                      };
                    };

                    // Handle object type with properties OR properties without explicit type
                    if ((schema.type === 'object' || !schema.type) && schema.properties) {
                      const nestedProps = Object.entries(schema.properties)
                        .filter(([propName, nestedPropSchema]: [string, unknown]) => {
                          // Skip additionalProperties as it will be handled separately
                          if (propName === 'additionalProperties') {
                            return false;
                          }
                          const typedNestedProp = nestedPropSchema as { readOnly?: boolean };
                          return typedNestedProp.readOnly !== true;
                        })
                        .map(([nestedPropName, nestedPropSchema]: [string, unknown]) => {
                          const typedNestedProp = nestedPropSchema as {
                            type?: string;
                            description?: string;
                            '$ref'?: string;
                            items?: {
                              type?: string;
                              '$ref'?: string;
                            };
                          };

                          let nestedPropType = typedNestedProp.type || 'object';
                          if (typedNestedProp.$ref) {
                            const refMatch = typedNestedProp.$ref.match(/[^/]+$/);
                            if (refMatch) {
                              nestedPropType = refMatch[0];
                            }
                          } else if (typedNestedProp.type === 'array') {
                            const items = typedNestedProp.items;
                            if (items?.type) {
                              nestedPropType = `${items.type}[]`;
                            } else if (items?.$ref) {
                              const refMatch = items.$ref.match(/[^/]+$/);
                              if (refMatch) {
                                nestedPropType = `${refMatch[0]}[]`;
                              }
                            } else {
                              nestedPropType = 'array';
                            }
                          } else if ((nestedPropSchema as { additionalProperties?: unknown }).additionalProperties) {
                            // Objects with additionalProperties are maps
                            nestedPropType = 'map';
                          }

                          return {
                            name: nestedPropName,
                            type: nestedPropType,
                            required: (schema.required || []).includes(nestedPropName),
                            description: formatDescription(typedNestedProp.description || ''),
                            schema: nestedPropSchema,
                          };
                        });

                      // If this object also has additionalProperties, add a "Map of key/values" entry
                      const hasAdditionalProps = schema.additionalProperties || 
                        (schema.properties && 'additionalProperties' in schema.properties);
                        
                      if (hasAdditionalProps) {
                        const additionalPropsSchema = (schema.additionalProperties || 
                          schema.properties?.additionalProperties) as {
                          description?: string;
                          type?: string;
                        };
                        
                        nestedProps.push({
                          name: 'Map of key/values',
                          type: 'map',
                          required: false,
                          description: formatDescription(additionalPropsSchema?.description || 'Additional key-value pairs'),
                          schema: additionalPropsSchema,
                        });
                      }

                      return {
                        properties: nestedProps,
                        required: schema.required || [],
                      };
                    }

                    // Handle array type with object items
                    if (schema.type === 'array' && schema.items?.type === 'object' && schema.items.properties) {
                      const nestedProps = Object.entries(schema.items.properties)
                        .filter(([, nestedPropSchema]: [string, unknown]) => {
                          const typedNestedProp = nestedPropSchema as { readOnly?: boolean };
                          return typedNestedProp.readOnly !== true;
                        })
                        .map(([nestedPropName, nestedPropSchema]: [string, unknown]) => {
                          const typedNestedProp = nestedPropSchema as {
                            type?: string;
                            description?: string;
                            '$ref'?: string;
                            items?: {
                              type?: string;
                              '$ref'?: string;
                            };
                          };

                          let nestedPropType = typedNestedProp.type || 'object';
                          if (typedNestedProp.$ref) {
                            const refMatch = typedNestedProp.$ref.match(/[^/]+$/);
                            if (refMatch) {
                              nestedPropType = refMatch[0];
                            }
                          } else if (typedNestedProp.type === 'array') {
                            const items = typedNestedProp.items;
                            if (items?.type) {
                              nestedPropType = `${items.type}[]`;
                            } else if (items?.$ref) {
                              const refMatch = items.$ref.match(/[^/]+$/);
                              if (refMatch) {
                                nestedPropType = `${refMatch[0]}[]`;
                              }
                            } else {
                              nestedPropType = 'array';
                            }
                          } else if ((nestedPropSchema as { additionalProperties?: unknown }).additionalProperties) {
                            // Objects with additionalProperties are maps
                            nestedPropType = 'map';
                          }

                          return {
                            name: nestedPropName,
                            type: nestedPropType,
                            required: (schema.items?.required || []).includes(nestedPropName),
                            description: formatDescription(typedNestedProp.description || ''),
                            schema: nestedPropSchema,
                          };
                        });

                      return {
                        properties: nestedProps,
                        required: schema.items.required || [],
                      };
                    }

                    // Handle additionalProperties (for dynamic object structures like connections)
                    if (schema.additionalProperties && schema.additionalProperties.properties) {
                      // Add a name property first for additionalProperties objects
                      const parentDescription = (schema as { description?: string }).description;
                      const nameProperty = {
                        name: 'name',
                        type: 'string',
                        required: true,
                        description: parentDescription ? formatDescription(parentDescription) : '',
                        schema: { type: 'string', description: parentDescription ? formatDescription(parentDescription) : '' },
                      };

                      const nestedProps = [nameProperty, ...Object.entries(schema.additionalProperties.properties)
                        .filter(([, nestedPropSchema]: [string, unknown]) => {
                          const typedNestedProp = nestedPropSchema as { readOnly?: boolean };
                          return typedNestedProp.readOnly !== true;
                        })
                        .map(([nestedPropName, nestedPropSchema]: [string, unknown]) => {
                          const typedNestedProp = nestedPropSchema as {
                            type?: string;
                            description?: string;
                            '$ref'?: string;
                            items?: {
                              type?: string;
                              '$ref'?: string;
                            };
                          };

                          let nestedPropType = typedNestedProp.type || 'object';
                          if (typedNestedProp.$ref) {
                            const refMatch = typedNestedProp.$ref.match(/[^/]+$/);
                            if (refMatch) {
                              nestedPropType = refMatch[0];
                            }
                          } else if (typedNestedProp.type === 'array') {
                            const items = typedNestedProp.items;
                            if (items?.type) {
                              nestedPropType = `${items.type}[]`;
                            } else if (items?.$ref) {
                              const refMatch = items.$ref.match(/[^/]+$/);
                              if (refMatch) {
                                nestedPropType = `${refMatch[0]}[]`;
                              }
                            } else {
                              nestedPropType = 'array';
                            }
                          } else if ((nestedPropSchema as { additionalProperties?: unknown }).additionalProperties) {
                            // Objects with additionalProperties are maps
                            nestedPropType = 'map';
                          }

                          return {
                            name: nestedPropName,
                            type: nestedPropType,
                            required: (schema.additionalProperties?.required || []).includes(nestedPropName),
                            description: formatDescription(typedNestedProp.description || ''),
                            schema: nestedPropSchema,
                          };
                        })];

                      return {
                        properties: nestedProps,
                        required: ['name', ...(schema.additionalProperties.required || [])],
                      };
                    }

                    return null;
                  };

                  // Collect all nested property tables recursively
                  const collectAllNestedTables = (
                    props: Array<{name: string; type: string; required: boolean; description: string; schema: unknown}>,
                    prefix = ''
                  ): Array<{
                    id: string;
                    title: string;
                    parentProperty: string;
                    parentDescription: string;
                    properties: Array<{name: string; type: string; required: boolean; description: string; schema: unknown}>;
                  }> => {
                    const tables: Array<{
                      id: string;
                      title: string;
                      parentProperty: string;
                      parentDescription: string;
                      properties: Array<{name: string; type: string; required: boolean; description: string; schema: unknown}>;
                    }> = [];

                    for (const prop of props) {
                      // Check if property might have nested properties
                      const nested = extractNestedProperties(prop.schema);
                      if (nested && nested.properties.length > 0) {
                        const tableId = `${prefix}${prop.name}`;
                        // Remove trailing dot from prefix for display purposes
                        const cleanPrefix = prefix.endsWith('.') ? prefix.slice(0, -1) : prefix;
                        const fullPath = cleanPrefix ? `${cleanPrefix}.${prop.name}` : prop.name;
                        tables.push({
                          id: tableId,
                          title: `${fullPath} Properties`,
                          parentProperty: prop.name,
                          parentDescription: prop.description ? formatDescription(prop.description) : '',
                          properties: nested.properties,
                        });

                        // Recursively collect nested tables
                        const nestedTables = collectAllNestedTables(nested.properties, `${tableId}.`);
                        tables.push(...nestedTables);
                      }
                    }

                    return tables;
                  };

                  const nestedTables = collectAllNestedTables(properties).sort((a, b) => 
                    a.title.localeCompare(b.title)
                  );



                  return (
                    <div key={version} id={`version-${version}`} style={{ marginBottom: '32px' }}>
                      <Typography variant="h6" gutterBottom style={{ marginBottom: '16px' }}>
                        API Version: <code style={{ 
                          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                          fontSize: '0.9em',
                          backgroundColor: 'rgba(175, 184, 193, 0.2)',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          color: '#24292f'
                        }}>{version}</code>
                      </Typography>


                      
                      {properties.length > 0 ? (
                        <TableContainer component={Paper}>
                          <Table>
                            <TableHead>
                              <TableRow>
                                {['Property', 'Type', 'Required', 'Description'].map((header, index) => {
                                  const widths = ['200px', '120px', '100px', 'auto'];
                                  const minWidths = ['150px', '100px', '80px', '250px'];
                                  return (
                                    <TableCell 
                                      key={header}
                                      className={classes.tableCell} 
                                      style={{ width: widths[index], minWidth: minWidths[index] }}
                                    >
                                      <strong>{header}</strong>
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {properties.map((property) => (
                                <TableRow key={property.name}>
                                  <TableCell className={classes.tableCell} style={{
                                    fontFamily: 'monospace', 
                                    fontSize: '13px',
                                    width: '200px',
                                    minWidth: '150px',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {(property.type === 'object' || property.type === 'map' || property.type.endsWith('[]') || property.type === 'array') && nestedTables.some(table => table.parentProperty === property.name) ? (
                                      <a 
                                        href={`#${version}-${property.name}`} 
                                        style={{ 
                                          color: '#0969da', 
                                          textDecoration: 'underline'
                                        }}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          const element = document.getElementById(`${version}-${property.name}`);
                                          if (element) {
                                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                          }
                                        }}
                                      >
                                        {property.name}
                                      </a>
                                    ) : (
                                      property.name
                                    )}
                                  </TableCell>
                                  <TableCell className={classes.tableCell} style={{ 
                                    fontFamily: 'monospace', 
                                    fontSize: '13px',
                                    width: '120px',
                                    minWidth: '100px',
                                    wordBreak: 'break-word'
                                  }}>
                                    {property.type}
                                  </TableCell>
                                  <TableCell className={classes.tableCell} style={{
                                    width: '100px',
                                    minWidth: '80px'
                                  }}>
                                    {property.required ? (
                                      <span style={{ color: '#cf222e', fontSize: '12px', fontWeight: 'bold' }}>
                                        Yes
                                      </span>
                                    ) : (
                                      <span style={{ color: '#656d76', fontSize: '12px' }}>
                                        No
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className={classes.tableCell} style={{
                                    width: 'auto',
                                    minWidth: '250px',
                                    wordBreak: 'break-word',
                                    whiteSpace: 'normal',
                                    lineHeight: '1.4'
                                  }}>
                                    {property.description ? (
                                      <div className={classes.markdownDescription} style={{ 
                                        fontSize: '14px'
                                      }}>
                                        <MarkdownContent content={property.description} />
                                      </div>
                                    ) : (
                                      <em style={{ color: '#656d76' }}>No description available</em>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      ) : (
                        <Paper style={{ padding: '16px', backgroundColor: '#f6f8fa' }}>
                          <Typography variant="body2" style={{ color: '#656d76', fontStyle: 'italic' }}>
                            No properties available for this API version or schema not found.
                          </Typography>
                        </Paper>
                      )}

                      {/* Render nested property tables */}
                      {nestedTables.map((table) => (
                        <div key={table.id} id={`${version}-${table.id}`} style={{ marginTop: '32px' }}>
                          <Typography variant="h6" gutterBottom style={{ 
                            marginBottom: '16px',
                            borderBottom: '2px solid #f1f8ff',
                            paddingBottom: '8px'
                          }}>
                            {table.title}
                            <Typography variant="body2" style={{ 
                              color: '#656d76', 
                              fontWeight: 'normal',
                              marginTop: '4px'
                            }}>
                              {table.parentDescription || `Properties for the ${table.parentProperty} object`}
                            </Typography>
                          </Typography>
                          
                          <TableContainer component={Paper}>
                            <Table>
                              <TableHead>
                                <TableRow>
                                  <TableCell className={classes.tableCell} style={{ width: '200px', minWidth: '150px' }}><strong>Property</strong></TableCell>
                                  <TableCell className={classes.tableCell} style={{ width: '120px', minWidth: '100px' }}><strong>Type</strong></TableCell>
                                  <TableCell className={classes.tableCell} style={{ width: '100px', minWidth: '80px' }}><strong>Required</strong></TableCell>
                                  <TableCell className={classes.tableCell} style={{ width: 'auto', minWidth: '250px' }}><strong>Description</strong></TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {table.properties.map((property) => (
                                  <TableRow key={property.name}>
                                    <TableCell className={classes.tableCell} style={{ 
                                      fontFamily: 'monospace', 
                                      fontSize: '13px',
                                      width: '200px',
                                      minWidth: '150px',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {(property.type === 'object' || property.type === 'map' || property.type.endsWith('[]') || property.type === 'array') && nestedTables.some(nestedTable => nestedTable.id === `${table.id}.${property.name}`) ? (
                                        <a 
                                          href={`#${version}-${table.id}.${property.name}`} 
                                          style={{ 
                                            color: '#0969da', 
                                            textDecoration: 'underline'
                                          }}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            const element = document.getElementById(`${version}-${table.id}.${property.name}`);
                                            if (element) {
                                              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            }
                                          }}
                                        >
                                          {property.name}
                                        </a>
                                      ) : (
                                        property.name
                                      )}
                                    </TableCell>
                                    <TableCell className={classes.tableCell} style={{ 
                                      fontFamily: 'monospace', 
                                      fontSize: '13px',
                                      width: '120px',
                                      minWidth: '100px',
                                      wordBreak: 'break-word'
                                    }}>
                                      {property.type}
                                    </TableCell>
                                    <TableCell className={classes.tableCell} style={{
                                      width: '100px',
                                      minWidth: '80px'
                                    }}>
                                      {property.required ? (
                                        <span style={{ color: '#cf222e', fontSize: '12px', fontWeight: 'bold' }}>
                                          Yes
                                        </span>
                                      ) : (
                                        <span style={{ color: '#656d76', fontSize: '12px' }}>
                                          No
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className={classes.tableCell} style={{
                                      width: 'auto',
                                      minWidth: '250px',
                                      wordBreak: 'break-word',
                                      whiteSpace: 'normal',
                                      lineHeight: '1.4'
                                    }}>
                                      {property.description ? (
                                        <div className={classes.markdownDescription} style={{ 
                                          fontSize: '14px'
                                        }}>
                                          <MarkdownContent content={property.description} />
                                        </div>
                                      ) : (
                                        <em style={{ color: '#656d76' }}>No description available</em>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                          
                          {/* Back to parent link */}
                          <div style={{ marginTop: '16px', textAlign: 'right' }}>
                            <a
                              href={`#${version}-${table.parentProperty}`}
                              style={{
                                color: '#0969da',
                                textDecoration: 'none',
                                fontSize: '14px',
                                fontWeight: '500',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                // Check if this is a top-level property (no dots in table.id)
                                if (!table.id.includes('.')) {
                                  // Navigate to main properties table
                                  const element = document.getElementById(`version-${version}`);
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }
                                } else {
                                  // Navigate to parent table - get the parent table ID correctly
                                  const parentId = table.id.substring(0, table.id.lastIndexOf('.'));
                                  // If parentId has no dots, it's a top-level property
                                  const targetId = parentId.includes('.') ? `${version}-${parentId}` : `${version}-${parentId}`;
                                  const element = document.getElementById(targetId);
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }
                                }
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.textDecoration = 'underline';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.textDecoration = 'none';
                              }}
                            >
                              ↑ Back to parent
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </Grid>
            </Grid>
          </TabbedLayout.Route>
          
          <TabbedLayout.Route path="/output-properties" title="Output Properties">
            <Grid container spacing={3}>
              <Grid item xs={12}>
                {/* API Version Navigation */}
                {Object.keys(resourceType.APIVersions || {}).length > 1 && (
                  <Paper style={{ 
                    padding: '16px', 
                    marginBottom: '32px', 
                    backgroundColor: '#f8f9fa', 
                    border: '1px solid #d0d7de' 
                  }}>
                    <Typography variant="subtitle2" style={{ 
                      marginBottom: '12px', 
                      fontWeight: 'bold',
                      color: '#24292f'
                    }}>
                      API Versions
                    </Typography>
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '8px',
                      alignItems: 'center'
                    }}>
                      {Object.keys(resourceType.APIVersions || {})
                        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
                        .map((version) => (
                          <a
                            key={version}
                            href={`#output-version-${version}`}
                            style={{
                              display: 'inline-block',
                              padding: '6px 12px',
                              fontSize: '13px',
                              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                              backgroundColor: '#fff',
                              border: '1px solid #d0d7de',
                              borderRadius: '6px',
                              color: '#24292f',
                              textDecoration: 'none',
                              transition: 'all 0.2s ease',
                              cursor: 'pointer'
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              const element = document.getElementById(`output-version-${version}`);
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f6f8fa';
                              e.currentTarget.style.borderColor = '#8c959f';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 3px 6px rgba(0,0,0,0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#fff';
                              e.currentTarget.style.borderColor = '#d0d7de';
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            {version}
                          </a>
                        ))}
                    </div>
                  </Paper>
                )}

                {Object.entries(resourceType.APIVersions || {})
                  .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
                  .map(([version, versionData]) => {
                  const typedVersionData = versionData as { 
                    schema?: {
                      properties?: Record<string, {
                        type?: string;
                        description?: string;
                        readOnly?: boolean;
                        required?: string[];
                        properties?: Record<string, unknown>;
                      }>;
                      required?: string[];
                    };
                    // Also support uppercase Schema for compatibility
                    Schema?: {
                      type?: string;
                      properties?: Record<string, {
                        type?: string;
                        description?: string;
                        readOnly?: boolean;
                        required?: string[];
                        properties?: Record<string, unknown>;
                      }>;
                      required?: string[];
                    };
                  };

                  // Find schema properties recursively
                  let schemaInfo: { properties?: Record<string, unknown>; required?: string[] } | null = null;
                  
                  if (typedVersionData.schema?.properties) {
                    schemaInfo = {
                      properties: typedVersionData.schema.properties as Record<string, unknown>,
                      required: typedVersionData.schema.required || []
                    };
                  } else if (typedVersionData.Schema?.properties) {
                    schemaInfo = {
                      properties: typedVersionData.Schema.properties as Record<string, unknown>,
                      required: typedVersionData.Schema.required || []
                    };
                  } else {
                    // Search deeply nested schemas
                    const findProperties = (obj: unknown): { properties?: Record<string, unknown>; required?: string[] } | null => {
                      if (!obj || typeof obj !== 'object') return null;
                      
                      const typed = obj as { 
                        properties?: Record<string, unknown>; 
                        required?: string[];
                        Schema?: unknown;
                        definitions?: Record<string, unknown>;
                        resource?: unknown;
                        resourceType?: unknown;
                      };
                      
                      // Direct properties
                      if (typed.properties) {
                        return { properties: typed.properties as Record<string, unknown>, required: typed.required as string[] };
                      }
                      
                      // Check Schema property
                      if (typed.Schema) {
                        const nested = findProperties(typed.Schema);
                        if (nested) return nested;
                      }
                      
                      // Check definitions
                      if (typed.definitions && typeof typed.definitions === 'object') {
                        const definitions = typed.definitions as Record<string, unknown>;
                        for (const defSchema of Object.values(definitions)) {
                          const nested = findProperties(defSchema);
                          if (nested) return nested;
                        }
                      }
                      
                      // Check resource/resourceType
                      if (typed.resource) {
                        const nested = findProperties(typed.resource);
                        if (nested) return nested;
                      }
                      
                      if (typed.resourceType) {
                        const nested = findProperties(typed.resourceType);
                        if (nested) return nested;
                      }
                      
                      return null;
                    };
                    schemaInfo = findProperties(typedVersionData.Schema);
                  }

                  // Extract schema info for property filtering
                  let propertiesSchemaInfo: { properties: Record<string, unknown>; required: string[] } | null = null;
                  
                  if (schemaInfo?.properties) {
                    propertiesSchemaInfo = {
                      properties: schemaInfo.properties,
                      required: schemaInfo.required || []
                    };
                  } else if (typedVersionData.schema?.properties) {
                    propertiesSchemaInfo = {
                      properties: typedVersionData.schema.properties as Record<string, unknown>,
                      required: typedVersionData.schema.required || []
                    };
                  } else if (typedVersionData.Schema?.properties) {
                    propertiesSchemaInfo = {
                      properties: typedVersionData.Schema.properties as Record<string, unknown>,
                      required: typedVersionData.Schema.required || []
                    };
                  }
                  
                  // For Output Properties tab, filter to show ONLY readOnly properties
                  const properties = propertiesSchemaInfo?.properties ? 
                    Object.entries(propertiesSchemaInfo.properties)
                      .filter(([, propSchema]: [string, unknown]) => {
                        const typedProp = propSchema as { readOnly?: boolean };
                        const isReadOnly = typedProp.readOnly === true;
                        // Show only properties that are explicitly marked as readOnly: true
                        return isReadOnly;
                      })
                      .map(([propName, propSchema]: [string, unknown]) => {
                        const typedProp = propSchema as { 
                          type?: string; 
                          description?: string;
                          '$ref'?: string;
                          items?: {
                            type?: string;
                            '$ref'?: string;
                          };
                          additionalProperties?: unknown;
                        };

                        let propType = typedProp.type || 'object';
                        if (typedProp.$ref) {
                          const refMatch = typedProp.$ref.match(/[^/]+$/);
                          if (refMatch) {
                            propType = refMatch[0];
                          }
                        } else if (typedProp.type === 'array') {
                          const items = typedProp.items;
                          if (items?.type) {
                            propType = `${items.type}[]`;
                          } else if (items?.$ref) {
                            const refMatch = items.$ref.match(/[^/]+$/);
                            if (refMatch) {
                              propType = `${refMatch[0]}[]`;
                            }
                          } else {
                            propType = 'array';
                          }
                        } else if (typedProp.additionalProperties) {
                          // Objects with additionalProperties are maps
                          propType = 'map';
                        }
                        
                        const actualRequiredFields = propertiesSchemaInfo?.required || [];
                        
                        return {
                          name: propName,
                          type: propType,
                          required: actualRequiredFields.includes(propName),
                          description: formatDescription(typedProp.description || ''),
                          schema: propSchema, // Keep the original schema for nested extraction
                        };
                      })
                    : [];

                  // Function to extract nested properties from object type properties (same as regular Properties tab)
                  const extractNestedProperties = (propertySchema: unknown): {
                    properties: Array<{name: string; type: string; required: boolean; description: string; schema: unknown}>;
                    required: string[];
                  } | null => {
                    const schema = propertySchema as {
                      type?: string;
                      properties?: Record<string, unknown>;
                      required?: string[];
                      items?: {
                        type?: string;
                        properties?: Record<string, unknown>;
                        required?: string[];
                      };
                      additionalProperties?: {
                        type?: string;
                        properties?: Record<string, unknown>;
                        required?: string[];
                      };
                    };

                    // Handle object type with properties OR properties without explicit type
                    if ((schema.type === 'object' || !schema.type) && schema.properties) {
                      const nestedProps = Object.entries(schema.properties)
                        .filter(([propName, nestedPropSchema]: [string, unknown]) => {
                          // Skip additionalProperties as it will be handled separately
                          if (propName === 'additionalProperties') {
                            return false;
                          }
                          const typedNestedProp = nestedPropSchema as { readOnly?: boolean };
                          return typedNestedProp.readOnly !== true;
                        })
                        .map(([nestedPropName, nestedPropSchema]: [string, unknown]) => {
                          const typedNestedProp = nestedPropSchema as {
                            type?: string;
                            description?: string;
                            '$ref'?: string;
                            items?: {
                              type?: string;
                              '$ref'?: string;
                            };
                          };

                          let nestedPropType = typedNestedProp.type || 'object';
                          if (typedNestedProp.$ref) {
                            const refMatch = typedNestedProp.$ref.match(/[^/]+$/);
                            if (refMatch) {
                              nestedPropType = refMatch[0];
                            }
                          } else if (typedNestedProp.type === 'array') {
                            const items = typedNestedProp.items;
                            if (items?.type) {
                              nestedPropType = `${items.type}[]`;
                            } else if (items?.$ref) {
                              const refMatch = items.$ref.match(/[^/]+$/);
                              if (refMatch) {
                                nestedPropType = `${refMatch[0]}[]`;
                              }
                            } else {
                              nestedPropType = 'array';
                            }
                          } else if ((nestedPropSchema as { additionalProperties?: unknown }).additionalProperties) {
                            // Objects with additionalProperties are maps
                            nestedPropType = 'map';
                          }

                          return {
                            name: nestedPropName,
                            type: nestedPropType,
                            required: (schema.required || []).includes(nestedPropName),
                            description: formatDescription(typedNestedProp.description || ''),
                            schema: nestedPropSchema,
                          };
                        });

                      // If this object also has additionalProperties, add a "Map of key/values" entry
                      const hasAdditionalProps = schema.additionalProperties || 
                        (schema.properties && 'additionalProperties' in schema.properties);
                        
                      if (hasAdditionalProps) {
                        const additionalPropsSchema = (schema.additionalProperties || 
                          schema.properties?.additionalProperties) as {
                          description?: string;
                          type?: string;
                        };
                        
                        nestedProps.push({
                          name: 'Map of key/values',
                          type: 'map',
                          required: false,
                          description: formatDescription(additionalPropsSchema?.description || 'Additional key-value pairs'),
                          schema: additionalPropsSchema,
                        });
                      }

                      return {
                        properties: nestedProps,
                        required: schema.required || [],
                      };
                    }

                    // Handle array type with object items
                    if (schema.type === 'array' && schema.items?.type === 'object' && schema.items.properties) {
                      const nestedProps = Object.entries(schema.items.properties)
                        .filter(([, nestedPropSchema]: [string, unknown]) => {
                          const typedNestedProp = nestedPropSchema as { readOnly?: boolean };
                          return typedNestedProp.readOnly !== true;
                        })
                        .map(([nestedPropName, nestedPropSchema]: [string, unknown]) => {
                          const typedNestedProp = nestedPropSchema as {
                            type?: string;
                            description?: string;
                            '$ref'?: string;
                            items?: {
                              type?: string;
                              '$ref'?: string;
                            };
                          };

                          let nestedPropType = typedNestedProp.type || 'object';
                          if (typedNestedProp.$ref) {
                            const refMatch = typedNestedProp.$ref.match(/[^/]+$/);
                            if (refMatch) {
                              nestedPropType = refMatch[0];
                            }
                          } else if (typedNestedProp.type === 'array') {
                            const items = typedNestedProp.items;
                            if (items?.type) {
                              nestedPropType = `${items.type}[]`;
                            } else if (items?.$ref) {
                              const refMatch = items.$ref.match(/[^/]+$/);
                              if (refMatch) {
                                nestedPropType = `${refMatch[0]}[]`;
                              }
                            } else {
                              nestedPropType = 'array';
                            }
                          } else if ((nestedPropSchema as { additionalProperties?: unknown }).additionalProperties) {
                            // Objects with additionalProperties are maps
                            nestedPropType = 'map';
                          }

                          return {
                            name: nestedPropName,
                            type: nestedPropType,
                            required: (schema.items?.required || []).includes(nestedPropName),
                            description: formatDescription(typedNestedProp.description || ''),
                            schema: nestedPropSchema,
                          };
                        });

                      return {
                        properties: nestedProps,
                        required: schema.items.required || [],
                      };
                    }

                    // Handle additionalProperties (for dynamic object structures like connections)
                    if (schema.additionalProperties && schema.additionalProperties.properties) {
                      // Add a name property first for additionalProperties objects
                      const parentDescription = (schema as { description?: string }).description;
                      const nameProperty = {
                        name: 'name',
                        type: 'string',
                        required: true,
                        description: parentDescription ? formatDescription(parentDescription) : '',
                        schema: { type: 'string', description: parentDescription ? formatDescription(parentDescription) : '' },
                      };

                      const nestedProps = [nameProperty, ...Object.entries(schema.additionalProperties.properties)
                        .filter(([, nestedPropSchema]: [string, unknown]) => {
                          const typedNestedProp = nestedPropSchema as { readOnly?: boolean };
                          return typedNestedProp.readOnly !== true;
                        })
                        .map(([nestedPropName, nestedPropSchema]: [string, unknown]) => {
                          const typedNestedProp = nestedPropSchema as {
                            type?: string;
                            description?: string;
                            '$ref'?: string;
                            items?: {
                              type?: string;
                              '$ref'?: string;
                            };
                          };

                          let nestedPropType = typedNestedProp.type || 'object';
                          if (typedNestedProp.$ref) {
                            const refMatch = typedNestedProp.$ref.match(/[^/]+$/);
                            if (refMatch) {
                              nestedPropType = refMatch[0];
                            }
                          } else if (typedNestedProp.type === 'array') {
                            const items = typedNestedProp.items;
                            if (items?.type) {
                              nestedPropType = `${items.type}[]`;
                            } else if (items?.$ref) {
                              const refMatch = items.$ref.match(/[^/]+$/);
                              if (refMatch) {
                                nestedPropType = `${refMatch[0]}[]`;
                              }
                            } else {
                              nestedPropType = 'array';
                            }
                          } else if ((nestedPropSchema as { additionalProperties?: unknown }).additionalProperties) {
                            // Objects with additionalProperties are maps
                            nestedPropType = 'map';
                          }

                          return {
                            name: nestedPropName,
                            type: nestedPropType,
                            required: (schema.additionalProperties?.required || []).includes(nestedPropName),
                            description: formatDescription(typedNestedProp.description || ''),
                            schema: nestedPropSchema,
                          };
                        })];

                      return {
                        properties: nestedProps,
                        required: ['name', ...(schema.additionalProperties.required || [])],
                      };
                    }

                    return null;
                  };

                  // Collect all nested property tables recursively
                  const collectAllNestedTables = (
                    props: Array<{name: string; type: string; required: boolean; description: string; schema: unknown}>,
                    prefix = ''
                  ): Array<{
                    id: string;
                    title: string;
                    parentProperty: string;
                    parentDescription: string;
                    properties: Array<{name: string; type: string; required: boolean; description: string; schema: unknown}>;
                  }> => {
                    const tables: Array<{
                      id: string;
                      title: string;
                      parentProperty: string;
                      parentDescription: string;
                      properties: Array<{name: string; type: string; required: boolean; description: string; schema: unknown}>;
                    }> = [];

                    for (const prop of props) {
                      // Check if property might have nested properties
                      const nested = extractNestedProperties(prop.schema);
                      if (nested && nested.properties.length > 0) {
                        const tableId = `${prefix}${prop.name}`;
                        // Remove trailing dot from prefix for display purposes
                        const cleanPrefix = prefix.endsWith('.') ? prefix.slice(0, -1) : prefix;
                        const fullPath = cleanPrefix ? `${cleanPrefix}.${prop.name}` : prop.name;
                        tables.push({
                          id: tableId,
                          title: `${fullPath} Properties`,
                          parentProperty: prop.name,
                          parentDescription: prop.description ? formatDescription(prop.description) : '',
                          properties: nested.properties,
                        });

                        // Recursively collect nested tables
                        const nestedTables = collectAllNestedTables(nested.properties, `${tableId}.`);
                        tables.push(...nestedTables);
                      }
                    }

                    return tables;
                  };

                  const nestedTables = collectAllNestedTables(properties).sort((a, b) => 
                    a.title.localeCompare(b.title)
                  );



                  return (
                    <div key={version} id={`output-version-${version}`} style={{ marginBottom: '32px' }}>
                      <Typography variant="h6" gutterBottom style={{ marginBottom: '16px' }}>
                        API Version: <code style={{ 
                          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                          fontSize: '0.9em',
                          backgroundColor: 'rgba(175, 184, 193, 0.2)',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          color: '#24292f'
                        }}>{version}</code>
                      </Typography>


                      
                      {properties.length > 0 ? (
                        <TableContainer component={Paper}>
                          <Table>
                            <TableHead>
                              <TableRow>
                                <TableCell className={classes.tableCell} style={{ width: '200px', minWidth: '150px' }}><strong>Property</strong></TableCell>
                                <TableCell className={classes.tableCell} style={{ width: '120px', minWidth: '100px' }}><strong>Type</strong></TableCell>
                                <TableCell className={classes.tableCell} style={{ width: 'auto', minWidth: '250px' }}><strong>Description</strong></TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {properties.map((property) => (
                                <TableRow key={property.name}>
                                  <TableCell className={classes.tableCell} style={{
                                    width: '200px',
                                    minWidth: '150px',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {(property.type === 'object' || property.type === 'map' || property.type.endsWith('[]') || property.type === 'array') && nestedTables.some(table => table.parentProperty === property.name) ? (
                                      <a 
                                        href={`#output-${version}-${property.name}`} 
                                        style={{ 
                                          color: '#0969da', 
                                          textDecoration: 'underline'
                                        }}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          const element = document.getElementById(`output-${version}-${property.name}`);
                                          if (element) {
                                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                          }
                                        }}
                                      >
                                        {property.name}
                                      </a>
                                    ) : (
                                      property.name
                                    )}
                                  </TableCell>
                                  <TableCell className={classes.tableCell} style={{ 
                                    fontFamily: 'monospace', 
                                    fontSize: '13px',
                                    width: '120px',
                                    minWidth: '100px',
                                    wordBreak: 'break-word'
                                  }}>
                                    {property.type}
                                  </TableCell>
                                  <TableCell className={classes.tableCell} style={{
                                    width: 'auto',
                                    minWidth: '250px',
                                    wordBreak: 'break-word',
                                    whiteSpace: 'normal',
                                    lineHeight: '1.4'
                                  }}>
                                    {property.description ? (
                                      <div className={classes.markdownDescription} style={{ 
                                        fontSize: '14px'
                                      }}>
                                        <MarkdownContent content={property.description} />
                                      </div>
                                    ) : (
                                      <em style={{ color: '#656d76' }}>No description available</em>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      ) : (
                        <Paper style={{ padding: '16px', backgroundColor: '#f6f8fa' }}>
                          <Typography variant="body2" style={{ color: '#656d76', fontStyle: 'italic' }}>
                            No output properties available for this API version.
                          </Typography>
                        </Paper>
                      )}

                      {/* Render nested property tables */}
                      {nestedTables.map((table) => (
                        <div key={table.id} id={`output-${version}-${table.id}`} style={{ marginTop: '32px' }}>
                          <Typography variant="h6" gutterBottom style={{ 
                            marginBottom: '16px',
                            borderBottom: '2px solid #f1f8ff',
                            paddingBottom: '8px'
                          }}>
                            {table.title}
                            <Typography variant="body2" style={{ 
                              color: '#656d76', 
                              fontWeight: 'normal',
                              marginTop: '4px'
                            }}>
                              {table.parentDescription || `Properties for the ${table.parentProperty} object`}
                            </Typography>
                          </Typography>
                          
                          <TableContainer component={Paper}>
                            <Table>
                              <TableHead>
                                <TableRow>
                                  <TableCell className={classes.tableCell} style={{ width: '200px', minWidth: '150px' }}><strong>Property</strong></TableCell>
                                  <TableCell className={classes.tableCell} style={{ width: '120px', minWidth: '100px' }}><strong>Type</strong></TableCell>
                                  <TableCell className={classes.tableCell} style={{ width: 'auto', minWidth: '250px' }}><strong>Description</strong></TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {table.properties.map((property) => (
                                  <TableRow key={property.name}>
                                    <TableCell className={classes.tableCell} style={{
                                      fontFamily: 'monospace', 
                                      fontSize: '13px',
                                      width: '200px',
                                      minWidth: '150px',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {(property.type === 'object' || property.type === 'map' || property.type.endsWith('[]') || property.type === 'array') && nestedTables.some(nestedTable => nestedTable.id === `${table.id}.${property.name}`) ? (
                                        <a 
                                          href={`#output-${version}-${table.id}.${property.name}`} 
                                          style={{ 
                                            color: '#0969da', 
                                            textDecoration: 'underline'
                                          }}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            const element = document.getElementById(`output-${version}-${table.id}.${property.name}`);
                                            if (element) {
                                              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            }
                                          }}
                                        >
                                          {property.name}
                                        </a>
                                      ) : (
                                        property.name
                                      )}
                                    </TableCell>
                                    <TableCell className={classes.tableCell} style={{ 
                                      fontFamily: 'monospace', 
                                      fontSize: '13px',
                                      width: '120px',
                                      minWidth: '100px',
                                      wordBreak: 'break-word'
                                    }}>
                                      {property.type}
                                    </TableCell>
                                    <TableCell className={classes.tableCell} style={{
                                      width: 'auto',
                                      minWidth: '250px',
                                      wordBreak: 'break-word',
                                      whiteSpace: 'normal',
                                      lineHeight: '1.4'
                                    }}>
                                      {property.description ? (
                                        <div className={classes.markdownDescription} style={{ 
                                          fontSize: '14px'
                                        }}>
                                          <MarkdownContent content={property.description} />
                                        </div>
                                      ) : (
                                        <em style={{ color: '#656d76' }}>No description available</em>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                          
                          {/* Back to parent link */}
                          <div style={{ marginTop: '16px', textAlign: 'right' }}>
                            <a
                              href={`#output-${version}-${table.parentProperty}`}
                              style={{
                                color: '#0969da',
                                textDecoration: 'none',
                                fontSize: '14px',
                                fontWeight: '500',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                // Check if this is a top-level property (no dots in table.id)
                                if (!table.id.includes('.')) {
                                  // Navigate to main properties table
                                  const element = document.getElementById(`output-version-${version}`);
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }
                                } else {
                                  // Navigate to parent table - get the parent table ID correctly
                                  const parentId = table.id.substring(0, table.id.lastIndexOf('.'));
                                  // If parentId has no dots, it's a top-level property
                                  const targetId = parentId.includes('.') ? `output-${version}-${parentId}` : `output-${version}-${parentId}`;
                                  const element = document.getElementById(targetId);
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }
                                }
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.textDecoration = 'underline';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.textDecoration = 'none';
                              }}
                            >
                              ↑ Back to parent
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </Grid>
            </Grid>
          </TabbedLayout.Route>
          
          <TabbedLayout.Route path="/details" title="Details">
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <InfoCard title="Resource Type Data">
                  <pre>{JSON.stringify(resourceType, null, 2)}</pre>
                </InfoCard>
              </Grid>
            </Grid>
          </TabbedLayout.Route>
        </TabbedLayout>
      </Content>
    </Page>
  );
};