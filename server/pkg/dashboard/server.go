// ------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------

package dashboard

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/project-radius/radius/pkg/ucp/hosting"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

const (
	HTTPServerStopTimeout = time.Second * 10
)

type ServerOptions struct {
	Port       string
	RestConfig *rest.Config
}

func NewServerOptionsFromFlags(port string, useLocal bool) (ServerOptions, error) {
	if port == "" {
		return ServerOptions{}, errors.New("flag: PORT must be set")
	}

	var config *rest.Config
	var err error
	if useLocal {
		config, err = createLocal()
		if err != nil {
			return ServerOptions{}, fmt.Errorf("failed to read Kubernetes config: %w", err)
		}
	} else {
		config, err = createCluster()
		if err != nil {
			return ServerOptions{}, fmt.Errorf("failed to read Kubernetes config: %w", err)
		}
	}

	return ServerOptions{
		Port:       port,
		RestConfig: config,
	}, nil
}

func NewServerOptionsFromEnvironment() (ServerOptions, error) {
	port := os.Getenv("PORT")
	if port == "" {
		return ServerOptions{}, errors.New("env: PORT must be set")
	}

	var config *rest.Config
	var err error
	useLocal := os.Getenv("K8S_LOCAL")
	if useLocal == "true" {
		config, err = createLocal()
		if err != nil {
			return ServerOptions{}, fmt.Errorf("failed to read Kubernetes config: %w", err)
		}
	} else {
		config, err = createCluster()
		if err != nil {
			return ServerOptions{}, fmt.Errorf("failed to read Kubernetes config: %w", err)
		}
	}

	return ServerOptions{
		Port:       port,
		RestConfig: config,
	}, nil
}

func createLocal() (*rest.Config, error) {
	var kubeConfig string
	if home := homeDir(); home != "" {
		kubeConfig = filepath.Join(home, ".kube", "config")
	} else {
		return nil, errors.New("no HOME directory, cannot find kubeconfig")
	}

	config, err := clientcmd.BuildConfigFromFlags("", kubeConfig)
	if err != nil {
		return nil, err
	}

	return config, nil
}

func createCluster() (*rest.Config, error) {
	log.Println("Creating Kubernetes client based on cluster context")

	config, err := clientcmd.BuildConfigFromFlags("", "")
	if err != nil {
		return nil, err
	}

	log.Println("Created Kubernetes client config")
	return config, nil
}

func homeDir() string {
	if h := os.Getenv("HOME"); h != "" {
		return h
	}
	return os.Getenv("USERPROFILE") // windows
}

func NewServer(options ServerOptions) (*hosting.Host, error) {
	hostingServices := []hosting.Service{
		&Service{
			Address:    fmt.Sprintf("localhost:%s", options.Port),
			RestConfig: options.RestConfig,
		},
	}
	return &hosting.Host{
		Services: hostingServices,
	}, nil
}
