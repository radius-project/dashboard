import React, { useState } from 'react';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
  Link,
  InfoCard,
  StructuredMetadataTable,
} from '@backstage/core-components';
import {
  Checkbox,
  FormControlLabel,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Tooltip,
  IconButton,
} from '@material-ui/core';
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { radiusApiRef } from '../../plugin';

type RT = {
  id: string;
  name: string;
  type: string;
  properties: {
    namespace: string;
    type: string;
    apiVersion: string;
    apiVersions?: string[];
  };
};

export const ResourceTypesTable = (props: { title: string }) => {
  const [showOtherResourceTypes, setShowOtherResourceTypes] = useState(false);

  // Learn dialog state
  const [learnDialogOpen, setLearnDialogOpen] = useState(false);
  const [dialogView, setDialogView] = useState<'form' | 'results'>('form');

  // Learn form fields
  const [gitUrl, setGitUrl] = useState('');
  const [namespace, setNamespace] = useState('');
  const [typeName, setTypeName] = useState('');
  const [planeName] = useState('local'); // Currently always 'local'

  // Learn API call state
  const [learnLoading, setLearnLoading] = useState(false);
  const [learnError, setLearnError] = useState<Error | undefined>(undefined);
  // Learn result state for Phase 3 results display
  const [learnResult, setLearnResult] = useState<
    | {
        namespace: string;
        typeName: string;
        yaml: string;
        variableCount: number;
        generatedTypeName: boolean;
        inferredNamespace: boolean;
      }
    | undefined
  >(undefined);

  const radiusApi = useApi(radiusApiRef);
  const { value, loading, error } = useAsync(async () => {
    // call the API method we added
    return (await radiusApi.listResourceTypes()) as
      | {
          value: RT[];
        }
      | undefined;
  });

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  // Filter resource types based on checkbox state
  // Hide commonly built-in namespaces by default to reduce clutter
  const EXCLUDED_NAMESPACES = ['Applications.', 'Microsoft.'];
  const allData = value?.value || [];
  const filteredData = showOtherResourceTypes
    ? allData
    : allData.filter(rt => {
        const rtNamespace = rt.properties?.namespace ?? '';
        return !EXCLUDED_NAMESPACES.some(prefix =>
          rtNamespace.startsWith(prefix),
        );
      });

  // Learn dialog handlers
  const resetLearnForm = () => {
    setGitUrl('');
    setNamespace('');
    setTypeName('');
    setLearnError(undefined);
    setLearnResult(undefined);
    setDialogView('form');
  };

  const handleLearnDialogClose = () => {
    setLearnDialogOpen(false);
    resetLearnForm();
  };

  const validateLearnForm = (): string | null => {
    const trimmedGitUrl = gitUrl.trim();

    if (!trimmedGitUrl) {
      return 'Git Repository URL is required';
    }

    // Basic URL validation
    try {
      // eslint-disable-next-line no-new
      new URL(trimmedGitUrl);
    } catch {
      return 'Please enter a valid URL';
    }

    return null;
  };

  const handleLearn = async () => {
    // Validate
    const validationError = validateLearnForm();
    if (validationError) {
      setLearnError(new Error(validationError));
      return;
    }

    // Clear previous state
    setLearnError(undefined);
    setLearnLoading(true);

    try {
      const result = await radiusApi.learnResourceType({
        gitUrl: gitUrl.trim(),
        namespace: namespace.trim() || undefined,
        typeName: typeName.trim() || undefined,
        planeName,
      });

      setLearnResult(result);
      setDialogView('results'); // Switch to results view
    } catch (err) {
      setLearnError(err as Error);
    } finally {
      setLearnLoading(false);
    }
  };

  // Component: GitHub-style copy button
  const GitHubCopyButton = ({ text }: { text: string }) => {
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
          size="small"
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ display: 'block' }}
          >
            {copied ? (
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            ) : (
              <path
                fillRule="evenodd"
                d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"
              />
            )}
            {!copied && (
              <path
                fillRule="evenodd"
                d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"
              />
            )}
          </svg>
        </IconButton>
      </Tooltip>
    );
  };

  const columns: TableColumn<RT>[] = [
    {
      title: 'Type',
      field: 'properties.type',
      type: 'string',
      render: (row: RT) => (
        <Link
          to={`/resource-types/${encodeURIComponent(
            row.properties.namespace,
          )}/${encodeURIComponent(row.properties.type)}`}
        >
          {row.properties.type}
        </Link>
      ),
    },
    { title: 'Namespace', field: 'properties.namespace', type: 'string' },
    {
      title: 'API Versions',
      field: 'properties.apiVersion',
      type: 'string',
      render: (row: RT) => (
        <div style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
          {row.properties.apiVersion}
        </div>
      ),
    },
  ];


  // Component: Form view
  const FormView = () => (
    <Box display="flex" flexDirection="column" pt={1}>
      {/* Git URL Field - Required */}
      <Box mb={2}>
        <TextField
          label="Git Repository URL"
          required
          fullWidth
          value={gitUrl}
          onChange={e => setGitUrl(e.target.value)}
          placeholder="https://github.com/username/repository"
          helperText="URL to a Git repository containing a Terraform module"
          disabled={learnLoading}
        />
      </Box>

      {/* Namespace Field - Optional */}
      <Box mb={2}>
        <TextField
          label="Namespace (Optional)"
          fullWidth
          value={namespace}
          onChange={e => setNamespace(e.target.value)}
          placeholder="Custom.Resources"
          helperText="Resource provider namespace (defaults to Custom.Resources)"
          disabled={learnLoading}
        />
      </Box>

      {/* Type Name Field - Optional */}
      <Box mb={2}>
        <TextField
          label="Type Name (Optional)"
          fullWidth
          value={typeName}
          onChange={e => setTypeName(e.target.value)}
          placeholder="myResourceType"
          helperText="Name for the resource type (auto-generated if not provided)"
          disabled={learnLoading}
        />
      </Box>

      {/* Error Display */}
      {learnError && (
        <Box mb={2}>
          <Typography color="error" variant="body2">
            {learnError.message}
          </Typography>
        </Box>
      )}

      {/* Loading Indicator */}
      {learnLoading && (
        <Box display="flex" alignItems="center">
          <CircularProgress size={20} />
          <Box ml={1}>
            <Typography variant="body2">
              Learning resource type from repository...
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );

  // Component: Results view with metadata and YAML
  const ResultsView = () => {
    if (!learnResult) return null;

    const metadata: { [key: string]: unknown } = {
      Namespace: learnResult.inferredNamespace ? (
        <Box display="flex" alignItems="center">
          <Typography variant="body2">{learnResult.namespace}</Typography>
          <Typography
            variant="caption"
            style={{ marginLeft: '8px', color: '#656d76' }}
          >
            (inferred)
          </Typography>
        </Box>
      ) : (
        learnResult.namespace
      ),
      'Type Name': learnResult.generatedTypeName ? (
        <Box display="flex" alignItems="center">
          <Typography variant="body2">{learnResult.typeName}</Typography>
          <Typography
            variant="caption"
            style={{ marginLeft: '8px', color: '#656d76' }}
          >
            (generated)
          </Typography>
        </Box>
      ) : (
        learnResult.typeName
      ),
      Variables: learnResult.variableCount,
    };

    return (
      <Box>
        <InfoCard title="Resource Type Metadata">
          <StructuredMetadataTable metadata={metadata} />
        </InfoCard>

        <Box mt={2}>
          <InfoCard title="Generated YAML">
            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  backgroundColor: '#f6f8fa',
                  border: '1px solid #d0d7de',
                  borderRadius: '6px',
                  padding: '16px',
                  overflow: 'auto',
                  fontSize: '12px',
                  lineHeight: 1.45,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                  margin: 0,
                }}
              >
                <code>{learnResult.yaml}</code>
              </pre>
              <GitHubCopyButton text={learnResult.yaml} />
            </div>
          </InfoCard>
        </Box>
      </Box>
    );
  };

  // Component: Learn dialog with form
  const LearnDialog = () => (
    <Dialog
      open={learnDialogOpen}
      onClose={handleLearnDialogClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>Learn Resource Type</DialogTitle>
      <DialogContent>
        {dialogView === 'form' ? <FormView /> : <ResultsView />}
      </DialogContent>

      <DialogActions>
        {dialogView === 'results' && (
          <Button onClick={() => setDialogView('form')}>Back</Button>
        )}
        <Button onClick={handleLearnDialogClose} disabled={learnLoading}>
          {dialogView === 'results' ? 'Close' : 'Cancel'}
        </Button>
        {dialogView === 'form' && (
          <Button
            onClick={handleLearn}
            color="primary"
            variant="contained"
            disabled={learnLoading || !gitUrl.trim()}
          >
            {learnLoading ? 'Learning...' : 'Continue'}
          </Button>
        )}
        {dialogView === 'results' && (
          <Button color="primary" variant="contained" disabled>
            Register
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );

  return (
    <>
      <Box>
        <Table
          key={`table-${showOtherResourceTypes}`}
          title={props.title}
          options={{ search: false, paging: false }}
          columns={columns}
          data={filteredData}
          actions={[
            {
              icon: () => (
                <Button
                  variant="contained"
                  color="primary"
                >
                  Learn Resource Type
                </Button>
              ),
              isFreeAction: true,
              onClick: () => setLearnDialogOpen(true),
            },
          ]}
        />
        <Box mt={2}>
          <FormControlLabel
            control={
              <Checkbox
                checked={showOtherResourceTypes}
                onChange={e => setShowOtherResourceTypes(e.target.checked)}
                color="primary"
              />
            }
            label={
              <span style={{ color: '#656d76', fontSize: '14px' }}>
                Show all resource types
              </span>
            }
          />
        </Box>
      </Box>

      {/* Learn Resource Type Dialog */}
      <LearnDialog />
    </>
  );
};
