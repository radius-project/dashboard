# Radius Dashboard

Radius Dashboard is the frontend experience for [Radius](https://github.com/radius-project/radius), a cloud-native application platform that enables developers and the platform engineers that support them to collaborate on delivering and managing cloud-native applications that follow organizational best practices for cost, operations and security, by default. Radius is an open-source project that supports deploying applications across private cloud, Microsoft Azure, and Amazon Web Services, with more cloud providers to come.

The Radius Dashboard is built on [Backstage](https://backstage.io/), an open-source platform for building developer portals that provides a rich set of components to accelerate UI development. The Radius Dashboard is a skinned deployment of Backstage that includes a set of plugins that provide the Radius experience. The components that make up the dashboard are built with extensibility in mind so that they can be used in other contexts beyond Backstage in the future.

Key features of the Radius Dashboard currently include:

- _Application graph visualization_: A visualization of the application graph that shows how resources within an application are connected to each other and the underlying infrastructure.
- _Resource overview and details_: Detailed information about resources within Radius, including applications, environments, and infrastructure.
- _Recipes directory_: A listing of all the Radius Recipes available to the user for a given environment.

> NOTE: Radius Dashboard is currently in a prototype stage and thus is not yet packaged into Radius and its releases, though we are planning to add it to the Radius installation soon. The best way to use Radius Dashboard right now is to clone the repo and run it locally, see the [contribution guide](./CONTRIBUTING.md) for instructions on how to build and run the code.

## Getting help

- ❓ **Have a question?** - Visit our [Discord server](https://discord.gg/SRG3ePMKNy) to post your question and we'll get back to you ASAP
- ⚠️ **Found an issue?** - Refer to our [Issues guide](docs/contributing/contributing-issues) for instructions on filing a bug report
- 💡 **Have a proposal?** - Refer to our [Issues guide](docs/contributing/contributing-issues) for instructions on filing a feature request

## Contributing to Radius Dashboard

Visit [Contributing](./CONTRIBUTING.md) for more information on how to contribute to Radius Dashboard.

## Community

We welcome your contributions and suggestions! One of the easiest ways to contribute is to participate in Issue discussions, chat on [Discord server](https://discord.gg/SRG3ePMKNy) or the monthly [community calls](#community-calls). For more information on the community engagement, developer and contributing guidelines and more, head over to the [Radius community repo](https://github.com/radius-project/community).

## Repositories

[Dashboard](https://github.com/radius-project/dashboard) is the Radius Dashboard repository. It contains all of Dashboard code and documentation. In addition, the Radius project has the below repositories:

| Repo                                                                 | Description                                                                                         |
| :------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| [Radius](https://github.com/radius-project/radius)                   | This is the main Radius repository that contains the source code for core Radius.                   |
| [Docs](https://github.com/radius-project/docs)                       | This repository contains the Radius documentation source for Radius.                                |
| [Samples](https://github.com/radius-project/samples)                 | This repository contains the source code for quickstarts, reference apps, and tutorials for Radius. |
| [Recipes](https://github.com/radius-project/recipes)                 | This repo contains commonly used Recipe templates for Radius Environments.                          |
| [Website](https://github.com/radius-project/website)                 | This repository contains the source code for the Radius website.                                    |
| [Bicep](https://github.com/radius-project/bicep)                     | This repository contains source code for Bicep, which is a DSL for deploying cloud resources types. |
| [AWS Bicep Types](https://github.com/radius-project/bicep-types-aws) | This repository contains the tooling for Bicep support for AWS resource types.                      |

## Security

Please refer to our guide on [Reporting security vulnerabilities](https://github.com/radius-project/radius/blob/main/SECURITY.md).

## Code of conduct

Please refer to our [Radius Community Code of Conduct](https://github.com/radius-project/community/blob/main/CODE-OF-CONDUCT.md)
